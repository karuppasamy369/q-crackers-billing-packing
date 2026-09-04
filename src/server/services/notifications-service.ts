import "server-only";

import { db } from "@/server/db";
import { Prisma } from "@/generated/prisma";
import type {
  NotificationEventType,
  NotificationStatus,
} from "@/generated/prisma";
import { requirePermission } from "@/server/rbac/authorize";
import { getRequestContext } from "@/server/http/request-context";
import { recordAudit } from "@/server/services/audit";
import { auditActor } from "@/server/services/_helpers";
import { NotFoundError, ValidationError, AppError } from "@/server/http/errors";
import { logger } from "@/lib/logger";
import { env } from "@/env";
import { formatPaise } from "@/lib/money";
import { sha256Hex } from "@/server/auth/tokens";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";
import { toWhatsAppRecipient, maskPhone } from "@/lib/notifications/phone";
import {
  renderNotification,
  NOTIFICATION_EVENT_TYPES,
  type TemplateData,
} from "@/lib/notifications/templates";
import { getWhatsAppProvider } from "@/server/integrations/notifications";
import {
  ensureTrackingTokenForOrder,
  getTrackingUrlForOrder,
} from "@/server/services/tracking-service";

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

/** Minutes to wait before retry attempt N (1-indexed by `attempts`). */
const BACKOFF_MINUTES = [1, 5, 30, 120, 360];
const STALE_SENDING_MINUTES = 15;
const RECONCILE_LOOKBACK_HOURS = 72;
const WORKER_BATCH = 25;
/** Delay before re-checking a message that is waiting for provider config. */
const UNCONFIGURED_RETRY_MINUTES = 30;
const MAX_ERROR_LEN = 500;

function backoffMinutes(attempts: number): number {
  return BACKOFF_MINUTES[Math.min(attempts, BACKOFF_MINUTES.length) - 1] ?? 360;
}

function safeError(raw: string): string {
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .slice(0, MAX_ERROR_LEN);
}

function displayOrderNo(order: {
  id: string;
  bill: { billNumber: string } | null;
}): string {
  return (
    order.bill?.billNumber ??
    `QC-${sha256Hex(order.id).slice(0, 8).toUpperCase()}`
  );
}

// ---------------------------------------------------------------------------
// Enqueue
// ---------------------------------------------------------------------------

export type EnqueueResult = "enqueued" | "skipped" | "duplicate";

type EnqueueInput = {
  orderId: string;
  eventType: NotificationEventType;
  /** When set, the enqueue is attributed to this user in the audit log. */
  actor?: { id: string; code: string; role: string };
};

/**
 * Record an outbound notification for an order event. Idempotent: the unique
 * `dedupeKey` means a second call for the same (order, event) is a no-op, so
 * retries and the reconciliation sweep never create a duplicate.
 */
export async function enqueueNotification(
  input: EnqueueInput,
): Promise<EnqueueResult> {
  const order = await db.order.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      customerId: true,
      customerPhone: true,
      locale: true,
    },
  });
  if (!order) throw new NotFoundError("That order does not exist.");

  const dedupeKey = `${order.id}:${input.eventType}`;
  const existing = await db.notificationOutbox.findUnique({
    where: { dedupeKey },
    select: { id: true },
  });
  if (existing) return "duplicate";

  const recipient = toWhatsAppRecipient(order.customerPhone);
  const status: NotificationStatus = recipient ? "PENDING" : "SKIPPED";

  try {
    const row = await db.notificationOutbox.create({
      data: {
        orderId: order.id,
        customerId: order.customerId,
        eventType: input.eventType,
        dedupeKey,
        recipientPhone: recipient,
        locale: isLocale(order.locale) ? order.locale : "en",
        status,
        provider: "none",
        maxAttempts: env.WHATSAPP_MAX_ATTEMPTS,
        lastError: recipient
          ? null
          : "No valid mobile number on file for this customer.",
      },
    });

    await recordAudit(
      input.actor
        ? {
            kind: "user",
            userId: input.actor.id,
            code: input.actor.code,
            role: input.actor.role,
          }
        : { kind: "system" },
      {
        action: "notification.enqueued",
        summary: `Queued ${input.eventType} WhatsApp notification for order ${order.id}${
          recipient ? "" : " (no phone — skipped)"
        }`,
        entityType: "NotificationOutbox",
        entityId: row.id,
        details: {
          eventType: input.eventType,
          orderId: order.id,
          recipient: maskPhone(recipient),
          status,
        },
      },
      await getRequestContext(),
    );

    return recipient ? "enqueued" : "skipped";
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return "duplicate";
    }
    throw err;
  }
}

/**
 * As {@link enqueueNotification} but never throws — for calling right after a
 * state-change transaction commits, where a notification hiccup must not affect
 * the order. Anything missed here is picked up by the reconciliation sweep.
 */
export async function enqueueNotificationSafe(
  input: EnqueueInput,
): Promise<void> {
  try {
    await enqueueNotification(input);
  } catch (err) {
    logger.error("notification.enqueue_failed", {
      orderId: input.orderId,
      eventType: input.eventType,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Delivery worker
// ---------------------------------------------------------------------------

export type WorkerSummary = {
  reclaimed: number;
  reconciled: number;
  claimed: number;
  sent: number;
  failed: number;
  dead: number;
  skipped: number;
  held: number;
};

export async function processNotificationOutbox(): Promise<WorkerSummary> {
  const reclaimed = await reclaimStaleSending();
  const reconciled = await reconcileMissingNotifications();

  const claimedRows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    UPDATE "notification_outbox"
       SET "status" = 'SENDING', "lastAttemptAt" = now(), "updatedAt" = now()
     WHERE "id" IN (
       SELECT "id" FROM "notification_outbox"
        WHERE "status" IN ('PENDING', 'FAILED')
          AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= now())
          AND "attempts" < "maxAttempts"
        ORDER BY "createdAt" ASC
        LIMIT ${WORKER_BATCH}
        FOR UPDATE SKIP LOCKED
     )
     RETURNING "id"
  `);

  const summary: WorkerSummary = {
    reclaimed,
    reconciled,
    claimed: claimedRows.length,
    sent: 0,
    failed: 0,
    dead: 0,
    skipped: 0,
    held: 0,
  };

  for (const { id } of claimedRows) {
    const outcome = await deliverOne(id);
    if (outcome === "sent") summary.sent++;
    else if (outcome === "dead") summary.dead++;
    else if (outcome === "skipped") summary.skipped++;
    else if (outcome === "held") summary.held++;
    else summary.failed++;
  }

  return summary;
}

async function reclaimStaleSending(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_SENDING_MINUTES * 60_000);
  const res = await db.notificationOutbox.updateMany({
    where: { status: "SENDING", lastAttemptAt: { lt: cutoff } },
    data: { status: "PENDING", nextAttemptAt: new Date() },
  });
  return res.count;
}

type DeliverOutcome = "sent" | "failed" | "dead" | "skipped" | "held";

async function deliverOne(id: string): Promise<DeliverOutcome> {
  const row = await db.notificationOutbox.findUnique({
    where: { id },
    include: {
      order: {
        select: {
          id: true,
          customerName: true,
          totalPaise: true,
          status: true,
          paymentStatus: true,
          bill: { select: { billNumber: true } },
          booking: {
            select: {
              courierName: true,
              lrNumber: true,
              parcelCount: true,
            },
          },
        },
      },
    },
  });
  if (!row || row.status !== "SENDING") return "failed";

  const provider = getWhatsAppProvider();
  const now = new Date();

  // No phone → terminal skip.
  if (!row.recipientPhone) {
    await db.notificationOutbox.update({
      where: { id },
      data: {
        status: "SKIPPED",
        nextAttemptAt: null,
        lastError: "No valid mobile number on file for this customer.",
      },
    });
    return "skipped";
  }

  // Provider not configured → hold (do not spend an attempt).
  if (!provider.configured) {
    await db.notificationOutbox.update({
      where: { id },
      data: {
        status: "PENDING",
        provider: provider.name,
        lastError: "WhatsApp provider is not configured.",
        nextAttemptAt: new Date(
          now.getTime() + UNCONFIGURED_RETRY_MINUTES * 60_000,
        ),
      },
    });
    return "held";
  }

  // Make sure the order has a tracking link and rebuild its current URL.
  await ensureTrackingTokenForOrder(row.order.id);
  const link = await getTrackingUrlForOrder(row.order.id);
  if (!link) {
    await db.notificationOutbox.update({
      where: { id },
      data: {
        status: "DEAD",
        nextAttemptAt: null,
        attempts: { increment: 1 },
        lastError: "No active tracking link for this order.",
      },
    });
    await auditWorker("notification.dead", row.id, row.order.id, row.eventType);
    return "dead";
  }

  const locale: Locale = isLocale(row.locale) ? row.locale : "en";
  const data: TemplateData = {
    name: row.order.customerName,
    orderNo: displayOrderNo(row.order),
    amount: formatPaise(row.order.totalPaise),
    courier: row.order.booking?.courierName ?? "",
    lrNumber: row.order.booking?.lrNumber ?? "",
    parcels:
      row.order.booking?.parcelCount != null
        ? String(row.order.booking.parcelCount)
        : "",
    link,
  };

  let rendered;
  try {
    rendered = renderNotification(row.eventType, data, getDictionary(locale));
  } catch (err) {
    // A template/data mismatch is a permanent bug, not a transient failure.
    await db.notificationOutbox.update({
      where: { id },
      data: {
        status: "DEAD",
        nextAttemptAt: null,
        attempts: { increment: 1 },
        lastError: safeError(
          err instanceof Error ? err.message : "template error",
        ),
      },
    });
    await auditWorker("notification.dead", row.id, row.order.id, row.eventType);
    return "dead";
  }

  let outcome;
  try {
    outcome = await provider.send({
      toE164: row.recipientPhone,
      body: rendered.body,
      locale,
      templateName: rendered.templateName,
      templateParams: rendered.templateParams,
    });
  } catch (err) {
    // A provider that throws (bug, unexpected shape) is treated as a transient
    // failure so the message is retried rather than lost or the run aborted.
    outcome = {
      ok: false as const,
      retryable: true,
      error: safeError(err instanceof Error ? err.message : "provider threw"),
    };
  }

  if (outcome.ok) {
    await db.notificationOutbox.update({
      where: { id },
      data: {
        status: "SENT",
        sentAt: now,
        providerMessageId: outcome.providerMessageId,
        provider: provider.name,
        attempts: { increment: 1 },
        nextAttemptAt: null,
        lastError: null,
        renderedBody: rendered.body,
      },
    });
    await auditWorker("notification.sent", row.id, row.order.id, row.eventType);
    return "sent";
  }

  const attempts = row.attempts + 1;
  const permanent = !outcome.retryable || attempts >= row.maxAttempts;
  await db.notificationOutbox.update({
    where: { id },
    data: {
      status: permanent ? "DEAD" : "FAILED",
      provider: provider.name,
      attempts,
      renderedBody: rendered.body,
      lastError: safeError(outcome.error),
      nextAttemptAt: permanent
        ? null
        : new Date(now.getTime() + backoffMinutes(attempts) * 60_000),
    },
  });
  if (permanent) {
    await auditWorker("notification.dead", row.id, row.order.id, row.eventType);
    return "dead";
  }
  return "failed";
}

async function auditWorker(
  action: string,
  entityId: string,
  orderId: string,
  eventType: NotificationEventType,
) {
  await recordAudit(
    { kind: "system" },
    {
      action,
      summary: `${action} — ${eventType} for order ${orderId}`,
      entityType: "NotificationOutbox",
      entityId,
      details: { orderId, eventType },
    },
  );
}

// ---------------------------------------------------------------------------
// Reconciliation — nothing is lost if a best-effort enqueue was missed
// ---------------------------------------------------------------------------

export async function reconcileMissingNotifications(): Promise<number> {
  const cutoff = new Date(Date.now() - RECONCILE_LOOKBACK_HOURS * 3_600_000);
  const orders = await db.order.findMany({
    where: { paymentStatus: "PAID", placedAt: { gte: cutoff } },
    select: {
      id: true,
      status: true,
      booking: {
        select: {
          packedAt: true,
          parcelBookedAt: true,
          lrDocuments: { where: { isCurrent: true }, select: { id: true } },
        },
      },
      notifications: { select: { eventType: true } },
    },
    take: 200,
  });

  let enqueued = 0;
  for (const order of orders) {
    const have = new Set(order.notifications.map((n) => n.eventType));
    const due: NotificationEventType[] = ["PAYMENT_RECEIVED"];
    if (order.booking?.packedAt) due.push("ORDER_PACKED");
    if (order.booking?.parcelBookedAt) due.push("PARCEL_BOOKED");
    if ((order.booking?.lrDocuments.length ?? 0) > 0) due.push("LR_AVAILABLE");

    for (const eventType of due) {
      if (have.has(eventType)) continue;
      await enqueueNotificationSafe({ orderId: order.id, eventType });
      enqueued++;
    }
  }
  return enqueued;
}

// ---------------------------------------------------------------------------
// Console (partner-only)
// ---------------------------------------------------------------------------

const PAGE_SIZE = 30;

export async function listNotifications(
  filter: {
    status?: string;
    eventType?: string;
    q?: string;
    page?: number;
  } = {},
) {
  await requirePermission("notifications.manage");
  const page = Math.max(1, Math.floor(filter.page ?? 1));

  const where: Prisma.NotificationOutboxWhereInput = {};
  const statuses: NotificationStatus[] = [
    "PENDING",
    "SENDING",
    "SENT",
    "FAILED",
    "DEAD",
    "SKIPPED",
  ];
  if (filter.status && statuses.includes(filter.status as NotificationStatus)) {
    where.status = filter.status as NotificationStatus;
  }
  if (
    filter.eventType &&
    (NOTIFICATION_EVENT_TYPES as readonly string[]).includes(filter.eventType)
  ) {
    where.eventType = filter.eventType as NotificationEventType;
  }
  if (filter.q) {
    where.order = {
      is: {
        OR: [
          { reference: { contains: filter.q, mode: "insensitive" } },
          { customerName: { contains: filter.q, mode: "insensitive" } },
          {
            bill: {
              is: { billNumber: { contains: filter.q, mode: "insensitive" } },
            },
          },
        ],
      },
    };
  }

  const total = await db.notificationOutbox.count({ where });
  const rows = await db.notificationOutbox.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      eventType: true,
      status: true,
      provider: true,
      attempts: true,
      maxAttempts: true,
      lastAttemptAt: true,
      nextAttemptAt: true,
      sentAt: true,
      lastError: true,
      createdAt: true,
      recipientPhone: true,
      order: {
        select: {
          id: true,
          customerName: true,
          bill: { select: { billNumber: true } },
        },
      },
    },
  });

  return {
    rows: rows.map((r) => ({
      id: r.id,
      eventType: r.eventType,
      status: r.status,
      provider: r.provider,
      attempts: r.attempts,
      maxAttempts: r.maxAttempts,
      lastAttemptAt: r.lastAttemptAt,
      nextAttemptAt: r.nextAttemptAt,
      sentAt: r.sentAt,
      lastError: r.lastError,
      createdAt: r.createdAt,
      recipientMasked: maskPhone(r.recipientPhone),
      orderId: r.order.id,
      orderNo: displayOrderNo(r.order),
      customerName: r.order.customerName,
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/** Notification rows for one order — shown on the order detail page. Masked
 *  recipient, no secrets; visible to anyone who can view the order. */
export async function getOrderNotifications(orderId: string) {
  await requirePermission("orders.view");
  const rows = await db.notificationOutbox.findMany({
    where: { orderId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      eventType: true,
      status: true,
      attempts: true,
      maxAttempts: true,
      sentAt: true,
      nextAttemptAt: true,
      lastError: true,
      recipientPhone: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    eventType: r.eventType,
    status: r.status,
    attempts: r.attempts,
    maxAttempts: r.maxAttempts,
    sentAt: r.sentAt,
    nextAttemptAt: r.nextAttemptAt,
    lastError: r.lastError,
    recipientMasked: maskPhone(r.recipientPhone),
  }));
}

export function getNotificationProviderStatus() {
  return {
    provider: env.WHATSAPP_PROVIDER,
    configured: getWhatsAppProvider().configured,
    maxAttempts: env.WHATSAPP_MAX_ATTEMPTS,
  };
}

/** Re-queue a FAILED / DEAD message for a fresh set of attempts. */
export async function retryNotification(raw: unknown): Promise<void> {
  const auth = await requirePermission("notifications.manage");
  const id =
    typeof raw === "object" && raw && "id" in raw
      ? String((raw as { id: unknown }).id)
      : "";
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(id)) throw new ValidationError("Invalid notification id.");

  const row = await db.notificationOutbox.findUnique({ where: { id } });
  if (!row) throw new NotFoundError("That notification does not exist.");
  if (row.status === "SENT") {
    throw new ValidationError("That notification has already been sent.");
  }
  if (row.status === "SKIPPED" && !row.recipientPhone) {
    throw new ValidationError(
      "This customer has no valid mobile number — nothing to retry.",
    );
  }

  await db.notificationOutbox.update({
    where: { id },
    data: {
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: new Date(),
      lastError: null,
    },
  });
  await recordAudit(
    auditActor(auth),
    {
      action: "notification.retry",
      summary: `${auth.user.code} re-queued ${row.eventType} notification for order ${row.orderId}`,
      entityType: "NotificationOutbox",
      entityId: id,
      details: { eventType: row.eventType, orderId: row.orderId },
    },
    await getRequestContext(),
  );
}

/** Partner sends the customer a review request for a completed-ish order. */
export async function requestReviewNotification(
  raw: unknown,
): Promise<EnqueueResult> {
  const auth = await requirePermission("notifications.manage");
  const orderId =
    typeof raw === "object" && raw && "orderId" in raw
      ? String((raw as { orderId: unknown }).orderId)
      : "";
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(orderId)) throw new ValidationError("Invalid order id.");

  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { status: true, paymentStatus: true },
  });
  if (!order) throw new NotFoundError("That order does not exist.");
  if (
    order.paymentStatus !== "PAID" ||
    !["PARCEL_BOOKED", "COMPLETED"].includes(order.status)
  ) {
    throw new AppError(
      "CONFLICT",
      "A review request can only be sent once the parcel has been booked.",
    );
  }

  return enqueueNotification({
    orderId,
    eventType: "REVIEW_REQUEST",
    actor: { id: auth.user.id, code: auth.user.code, role: auth.user.role },
  });
}
