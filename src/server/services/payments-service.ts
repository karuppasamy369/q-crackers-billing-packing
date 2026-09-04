import "server-only";

import { db } from "@/server/db";
import type {
  Prisma,
  PaymentStatus,
  PaymentVerificationMethod,
} from "@/generated/prisma";
import { requirePermission } from "@/server/rbac/authorize";
import {
  recordAudit,
  type AuditActor,
  type RequestContext,
} from "@/server/services/audit";
import { getRequestContext } from "@/server/http/request-context";
import { auditActor } from "@/server/services/_helpers";
import { AppError, NotFoundError, ValidationError } from "@/server/http/errors";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { formatPaise } from "@/lib/money";
import { normalizeUpiReference, buildUpiUri } from "@/lib/upi";
import {
  submitPaymentSchema,
  verifyPaymentSchema,
  paymentIdSchema,
  type SubmitPaymentInput,
} from "@/lib/validation/payment";
import { getPublicPaymentAccountForPartner } from "@/server/services/payment-accounts-service";
import {
  issueBillForOrderCore,
  safeGeneratePdf,
} from "@/server/services/billing-service";
import { enqueueNotificationSafe } from "@/server/services/notifications-service";
import { validateImageUpload } from "@/lib/image-validation";
import { getStorage } from "@/server/integrations/storage";
import { env } from "@/env";
import { randomUUID } from "node:crypto";

const PAGE_SIZE = 25;
const SUBMIT_RATE_MAX = 6;
const SUBMIT_RATE_WINDOW_MS = 10 * 60_000;

/** Payment states that occupy the "one active payment per order" slot. */
const ACTIVE_PAYMENT_STATUSES: PaymentStatus[] = [
  "INITIATED",
  "SUBMITTED",
  "VERIFIED",
];

const ALL_PAYMENT_STATUSES: PaymentStatus[] = [
  "INITIATED",
  "SUBMITTED",
  "VERIFIED",
  "REJECTED",
  "FAILED",
];

// ---------------------------------------------------------------------------
// Customer-facing: payment page context + submitting a UTR
// ---------------------------------------------------------------------------

export type PaymentPageContext = {
  reference: string;
  orderStatus: string;
  paymentStatus: string;
  totalPaise: number;
  partner: {
    code: string;
    partnerId: string;
    upiVpa: string | null;
    payeeName: string | null;
    instructions: string | null;
    hasStaticQr: boolean;
  } | null;
  upiUri: string | null;
  payment: {
    status: string;
    upiReference: string | null;
    submittedAt: Date | null;
    hasScreenshot: boolean;
  } | null;
};

async function loadOrderByReference(reference: string) {
  const order = await db.order.findUnique({
    where: { reference },
    include: { items: true },
  });
  if (!order) throw new NotFoundError("Order not found.");
  return order;
}

export async function getPaymentPageContext(
  rawReference: string,
): Promise<PaymentPageContext> {
  const ref = submitPaymentSchema.shape.reference.safeParse(rawReference);
  if (!ref.success) throw new NotFoundError("Order not found.");

  const order = await db.order.findUnique({
    where: { reference: ref.data },
    include: {
      payments: {
        where: { status: { in: ACTIVE_PAYMENT_STATUSES } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  if (!order) throw new NotFoundError("Order not found.");

  const partnerAccount = order.assignedPartnerId
    ? await getPublicPaymentAccountForPartner(order.assignedPartnerId)
    : null;

  const payment = order.payments[0] ?? null;

  const upiUri =
    partnerAccount?.upiVpa && order.status === "AWAITING_PAYMENT"
      ? buildUpiUri({
          vpa: partnerAccount.upiVpa,
          payeeName:
            partnerAccount.payeeName ??
            order.assignedPartnerCode ??
            "Q Crackers",
          amountPaise: order.totalPaise,
          note: `Order ${order.reference.slice(0, 10)}`,
        })
      : null;

  return {
    reference: order.reference,
    orderStatus: order.status,
    paymentStatus: order.paymentStatus,
    totalPaise: order.totalPaise,
    partner: partnerAccount
      ? {
          code: partnerAccount.partnerCode,
          partnerId: order.assignedPartnerId!,
          upiVpa: partnerAccount.upiVpa,
          payeeName: partnerAccount.payeeName,
          instructions: partnerAccount.instructions,
          hasStaticQr: partnerAccount.hasStaticQr,
        }
      : null,
    upiUri,
    payment: payment
      ? {
          status: payment.status,
          upiReference: payment.upiReference,
          submittedAt: payment.submittedAt,
          hasScreenshot: Boolean(payment.screenshotStorageKey),
        }
      : null,
  };
}

/** A payment screenshot the customer optionally attaches alongside their
 *  UTR — never required, always validated the same way as any other image
 *  upload in the app before it's stored. */
export type PaymentScreenshotInput = {
  bytes: Uint8Array;
  filename: string;
};

/** Validate and store an optional payment screenshot. Same image validation
 *  (magic bytes, size cap) already used for a partner's static QR upload —
 *  no new rules invented for this. Throws `ValidationError` on a bad file. */
async function storePaymentScreenshot(
  screenshot: PaymentScreenshotInput,
): Promise<string> {
  const check = validateImageUpload(screenshot.bytes, env.STORAGE_MAX_IMAGE_BYTES);
  if (!check.ok) throw new ValidationError(check.error);

  const storage = getStorage();
  const key = `payment-screenshots/${randomUUID()}.${check.extension}`;
  await storage.put(key, screenshot.bytes, check.contentType);
  return key;
}

/**
 * The customer states they have paid, supplies their UPI transaction id
 * (required), and may optionally attach a payment screenshot as extra
 * evidence. This records a SUBMITTED payment — it does NOT mark the order
 * paid. An authorised person checks it (their own bank/UPI app, the UTR, and
 * the screenshot if attached) and verifies it (or, later, a PSP lookup /
 * webhook could).
 */
export async function submitPayment(
  rawReference: unknown,
  raw: unknown,
  screenshot?: PaymentScreenshotInput | null,
): Promise<{ status: "submitted" | "already_submitted" | "already_paid" }> {
  const ctx = await getRequestContext();
  const rl = rateLimit(
    `payment:submit:${ctx.ip ?? "unknown"}`,
    SUBMIT_RATE_MAX,
    SUBMIT_RATE_WINDOW_MS,
  );
  if (!rl.allowed) {
    throw new AppError(
      "RATE_LIMITED",
      "Too many attempts. Please wait a few minutes and try again.",
    );
  }

  const parsed = submitPaymentSchema.safeParse({
    ...(typeof raw === "object" && raw ? raw : {}),
    reference: rawReference,
  });
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Please check the details and retry.",
    );
  }
  const input: SubmitPaymentInput = parsed.data;
  const utr = normalizeUpiReference(input.upiReference);
  const payerName = input.payerName || null;
  const payerVpa = input.payerVpa || null;

  const order = await loadOrderByReference(input.reference);
  if (order.paymentStatus === "PAID") return { status: "already_paid" };
  if (order.status !== "AWAITING_PAYMENT") {
    throw new ValidationError("This order is not awaiting payment.");
  }

  const partnerAccount = order.assignedPartnerId
    ? await getPublicPaymentAccountForPartner(order.assignedPartnerId)
    : null;

  const existing = await db.payment.findFirst({
    where: { orderId: order.id, status: { in: ACTIVE_PAYMENT_STATUSES } },
  });
  if (existing?.status === "VERIFIED") return { status: "already_paid" };

  // A UTR is recorded at most once, anywhere.
  const utrClash = await db.payment.findFirst({
    where: {
      upiReference: utr,
      ...(existing ? { id: { not: existing.id } } : {}),
    },
  });
  if (utrClash) {
    throw new ValidationError(
      "That transaction ID has already been recorded. If you think this is a mistake, please contact us.",
    );
  }

  // Validate + store the optional screenshot before touching the payment row
  // — a bad file must fail without leaving a half-updated record behind.
  const screenshotKey = screenshot
    ? await storePaymentScreenshot(screenshot)
    : null;

  if (existing) {
    await db.payment.update({
      where: { id: existing.id },
      data: {
        status: "SUBMITTED",
        upiReference: utr,
        payerName: payerName ?? existing.payerName,
        payerVpa: payerVpa ?? existing.payerVpa,
        submittedAt: existing.submittedAt ?? new Date(),
        screenshotStorageKey: screenshotKey ?? existing.screenshotStorageKey,
      },
    });
    await recordAudit(
      { kind: "system" },
      {
        action: "payment.submit",
        summary: `Payment details updated for order ${order.reference}`,
        entityType: "Payment",
        entityId: existing.id,
        details: {
          reference: order.reference,
          upiReference: utr,
          hasScreenshot: Boolean(screenshotKey ?? existing.screenshotStorageKey),
        },
      },
      ctx,
    );
    return { status: "already_submitted" };
  }

  const created = await db.payment.create({
    data: {
      orderId: order.id,
      channel: "UPI",
      provider: "MANUAL",
      status: "SUBMITTED",
      amountPaise: order.totalPaise,
      currency: "INR",
      upiReference: utr,
      payerName,
      payerVpa,
      payeeVpa: partnerAccount?.upiVpa ?? null,
      payeeName: partnerAccount?.payeeName ?? null,
      assignedPartnerId: order.assignedPartnerId,
      submittedAt: new Date(),
      screenshotStorageKey: screenshotKey,
    },
  });

  await recordAudit(
    { kind: "system" },
    {
      action: "payment.submit",
      summary: `Customer submitted payment for order ${order.reference} — ${formatPaise(order.totalPaise)}`,
      entityType: "Payment",
      entityId: created.id,
      details: {
        reference: order.reference,
        hasScreenshot: Boolean(screenshotKey),
        upiReference: utr,
        amountPaise: order.totalPaise,
      },
    },
    ctx,
  );
  return { status: "submitted" };
}

// ---------------------------------------------------------------------------
// Internal: stock ledger transitions
// ---------------------------------------------------------------------------

type OrderItemLite = { productId: string; quantity: number };

async function lockInventory(
  tx: Prisma.TransactionClient,
  items: OrderItemLite[],
) {
  const ids = [...new Set(items.map((i) => i.productId))].sort();
  for (const id of ids) {
    await tx.$queryRaw`SELECT 1 FROM "inventory" WHERE "productId" = ${id}::uuid FOR UPDATE`;
  }
}

/** Payment confirmed: stock physically leaves. Reserved -> sold. */
async function commitStockAsSale(
  tx: Prisma.TransactionClient,
  order: { id: string; reference: string },
  items: OrderItemLite[],
  actorId: string | null,
) {
  await lockInventory(tx, items);
  for (const item of items) {
    const inv = await tx.inventory.findUnique({
      where: { productId: item.productId },
    });
    if (!inv) continue;
    const balanceAfter = inv.quantityOnHand - item.quantity;
    await tx.inventory.update({
      where: { productId: item.productId },
      data: {
        quantityOnHand: balanceAfter,
        quantityReserved: {
          decrement: Math.min(item.quantity, inv.quantityReserved),
        },
      },
    });
    await tx.inventoryMovement.create({
      data: {
        productId: item.productId,
        changeQty: -item.quantity,
        balanceAfter,
        reason: "SALE",
        note: `Order ${order.reference}`,
        refType: "order",
        refId: order.id,
        createdById: actorId,
      },
    });
  }
}

/** Release a hold without any physical movement (mirrors checkout reserve). */
async function releaseReservation(
  tx: Prisma.TransactionClient,
  items: OrderItemLite[],
) {
  await lockInventory(tx, items);
  for (const item of items) {
    const inv = await tx.inventory.findUnique({
      where: { productId: item.productId },
    });
    if (!inv) continue;
    await tx.inventory.update({
      where: { productId: item.productId },
      data: {
        quantityReserved: {
          decrement: Math.min(item.quantity, inv.quantityReserved),
        },
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Shared "mark paid" core — used by the manual verify action AND by an
// automatic PSP webhook / reconciliation lookup. One transaction, one set of
// invariants, regardless of who/what triggered it.
// ---------------------------------------------------------------------------

type ApplyVerifiedPaymentInput = {
  payment: { id: string; amountPaise: number; upiReference: string | null };
  order: { id: string; reference: string; status: string };
  items: OrderItemLite[];
  /** Who/what to attribute the audit rows to. `system` for an automatic
   *  webhook/reconciliation verification — never a fabricated user. */
  actor: AuditActor;
  /** A real user id for `verifiedById` / stock-movement attribution, or
   *  `null` for an automatic verification (no human involved). */
  verifiedById: string | null;
  /** The user attributed to the auto-issued bill (Bill.createdById is a
   *  required FK) — the order's own assigned partner for an automatic
   *  verification, the acting partner for a manual one. */
  billActor: { id: string; code: string; role: string };
  verificationMethod: PaymentVerificationMethod;
  utr: string | null;
  ctx: RequestContext;
};

async function applyVerifiedPayment(
  input: ApplyVerifiedPaymentInput,
): Promise<{ applied: boolean }> {
  let applied = false;

  await db.$transaction(async (tx) => {
    const fresh = await tx.order.findUniqueOrThrow({
      where: { id: input.order.id },
      select: { status: true, paymentStatus: true },
    });
    // Already paid (a concurrent verify, or a duplicate/replayed webhook) —
    // idempotent no-op, never processed twice.
    if (fresh.paymentStatus === "PAID") return;

    await tx.payment.update({
      where: { id: input.payment.id },
      data: {
        status: "VERIFIED",
        upiReference: input.utr ?? input.payment.upiReference,
        verifiedById: input.verifiedById,
        verifiedAt: new Date(),
        verificationMethod: input.verificationMethod,
      },
    });

    await commitStockAsSale(tx, input.order, input.items, input.verifiedById);

    await tx.order.update({
      where: { id: input.order.id },
      data: { paymentStatus: "PAID", status: "PAID" },
    });
    await tx.orderStatusHistory.create({
      data: {
        orderId: input.order.id,
        fromStatus: fresh.status,
        toStatus: "PAID",
        changedById: input.verifiedById,
        reason: `Payment verified (${input.verificationMethod})`,
      },
    });

    const actorLabel =
      input.actor.kind === "user" ? input.actor.code : "Automatic verification";
    await recordAudit(
      input.actor,
      {
        action: "payment.verify",
        summary: `${actorLabel} verified payment for order ${input.order.reference} — ${formatPaise(input.payment.amountPaise)}`,
        entityType: "Payment",
        entityId: input.payment.id,
        details: {
          reference: input.order.reference,
          upiReference: input.utr,
          amountPaise: input.payment.amountPaise,
          method: input.verificationMethod,
        },
      },
      input.ctx,
      tx,
    );
    await recordAudit(
      input.actor,
      {
        action: "order.paid",
        summary: `Order ${input.order.reference} marked PAID`,
        entityType: "Order",
        entityId: input.order.id,
        details: { reference: input.order.reference, paymentId: input.payment.id },
      },
      input.ctx,
      tx,
    );
    applied = true;
  });

  if (!applied) return { applied: false };

  // Auto-issue the bill under the order's assigned partner, outside the
  // payment transaction. A failure here (e.g. a mis-configured partner code)
  // leaves the order PAID but un-billed — it does not undo the payment.
  try {
    const freshOrder = await db.order.findUniqueOrThrow({
      where: { id: input.order.id },
      include: { items: true, bill: true },
    });
    if (!freshOrder.bill) {
      const bill = await issueBillForOrderCore(
        freshOrder,
        freshOrder.items,
        input.billActor,
        input.ctx,
      );
      await safeGeneratePdf(bill.id);
    }
  } catch (err) {
    logger.error("payment.verify.bill_failed", {
      orderId: input.order.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Notify the customer (best-effort, after commit). A hiccup here never
  // undoes a verified payment; the notification worker's reconciliation sweep
  // recovers anything missed.
  await enqueueNotificationSafe({
    orderId: input.order.id,
    eventType: "PAYMENT_RECEIVED",
  });

  return { applied: true };
}

// ---------------------------------------------------------------------------
// Verify / reject a payment (authorised manual fallback)
// ---------------------------------------------------------------------------

export async function verifyPayment(raw: unknown) {
  const auth = await requirePermission("payments.confirm_manual");
  const input = verifyPaymentSchema.parse(raw);
  const ctx = await getRequestContext();

  const payment = await db.payment.findUnique({
    where: { id: input.paymentId },
    include: { order: { include: { items: true } } },
  });
  if (!payment) throw new NotFoundError("That payment does not exist.");
  const order = payment.order;

  // The verification checks the correct order AND amount.
  if (payment.amountPaise !== order.totalPaise) {
    throw new ValidationError(
      `The payment amount (${formatPaise(payment.amountPaise)}) does not match the order total (${formatPaise(order.totalPaise)}). Reject it and ask the customer to pay again.`,
    );
  }

  // Idempotency — a processed payment is not re-processed.
  if (payment.status === "VERIFIED") return loadPaymentDetail(payment.id);
  if (payment.status === "REJECTED" || payment.status === "FAILED") {
    throw new ValidationError(
      `This payment is ${payment.status.toLowerCase()} and can no longer be changed.`,
    );
  }

  const items: OrderItemLite[] = order.items.map((i) => ({
    productId: i.productId,
    quantity: i.quantity,
  }));
  const utr = input.upiReference
    ? normalizeUpiReference(input.upiReference)
    : payment.upiReference;

  if (input.action === "reject") {
    await db.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "REJECTED",
          rejectionReason: input.note || "Payment not received",
          verifiedById: auth.user.id,
          verifiedAt: new Date(),
          verificationMethod: "MANUAL",
        },
      });
      await releaseReservation(tx, items);
      await tx.order.update({
        where: { id: order.id },
        data: { paymentStatus: "FAILED", status: "PAYMENT_FAILED" },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: "PAYMENT_FAILED",
          changedById: auth.user.id,
          reason: `Payment rejected: ${input.note}`,
        },
      });
      await recordAudit(
        auditActor(auth),
        {
          action: "payment.reject",
          summary: `${auth.user.code} rejected payment for order ${order.reference}`,
          entityType: "Payment",
          entityId: payment.id,
          details: { reference: order.reference, reason: input.note },
        },
        ctx,
        tx,
      );
    });
    return loadPaymentDetail(payment.id);
  }

  // --- action === "verify" (manual — a human confirms) --------------------
  await applyVerifiedPayment({
    payment: {
      id: payment.id,
      amountPaise: payment.amountPaise,
      upiReference: payment.upiReference,
    },
    order: { id: order.id, reference: order.reference, status: order.status },
    items,
    actor: auditActor(auth),
    verifiedById: auth.user.id,
    billActor: { id: auth.user.id, code: auth.user.code, role: auth.user.role },
    verificationMethod: "MANUAL",
    utr,
    ctx,
  });

  return loadPaymentDetail(payment.id);
}

// ---------------------------------------------------------------------------
// Console reads
// ---------------------------------------------------------------------------

export async function listPayments(
  filter: {
    q?: string;
    status?: string;
    partnerCode?: string;
    page?: number;
  } = {},
) {
  await requirePermission("payments.view");
  const page = Math.max(1, Math.floor(filter.page ?? 1));

  const where: Prisma.PaymentWhereInput = {};
  if (filter.q) {
    where.OR = [
      { upiReference: { contains: filter.q, mode: "insensitive" } },
      {
        order: {
          is: { reference: { contains: filter.q, mode: "insensitive" } },
        },
      },
      {
        order: {
          is: { customerName: { contains: filter.q, mode: "insensitive" } },
        },
      },
      { order: { is: { customerPhone: { contains: filter.q } } } },
    ];
  }
  if (
    filter.status &&
    ALL_PAYMENT_STATUSES.includes(filter.status as PaymentStatus)
  ) {
    where.status = filter.status as PaymentStatus;
  }
  if (filter.partnerCode) {
    where.order = {
      is: { assignedPartnerCode: filter.partnerCode.toUpperCase() },
    };
  }

  const total = await db.payment.count({ where });
  const rows = await db.payment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: {
      order: {
        select: {
          reference: true,
          customerName: true,
          customerPhone: true,
          assignedPartnerCode: true,
          status: true,
          totalPaise: true,
        },
      },
      verifiedBy: { select: { code: true } },
    },
  });

  return {
    rows,
    total,
    page,
    pageSize: PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

function loadPaymentDetail(id: string) {
  return db.payment.findUniqueOrThrow({
    where: { id },
    include: {
      order: {
        include: {
          items: { orderBy: { productName: "asc" } },
          bill: { select: { id: true, billNumber: true, status: true } },
        },
      },
      verifiedBy: { select: { code: true, name: true } },
    },
  });
}

export async function getPaymentForConsole(raw: unknown) {
  await requirePermission("payments.view");
  const { id } = paymentIdSchema.parse(raw);
  try {
    return await loadPaymentDetail(id);
  } catch {
    throw new NotFoundError("That payment does not exist.");
  }
}

/** The bytes of a customer-uploaded payment screenshot, for the console to
 *  display while a partner is verifying a payment. `null` when this payment
 *  has none. */
export async function getPaymentScreenshotBytes(
  raw: unknown,
): Promise<{ data: Uint8Array; contentType: string } | null> {
  await requirePermission("payments.view");
  const { id } = paymentIdSchema.parse(raw);
  const payment = await db.payment.findUnique({
    where: { id },
    select: { screenshotStorageKey: true },
  });
  if (!payment?.screenshotStorageKey) return null;
  const obj = await getStorage().get(payment.screenshotStorageKey);
  return obj ? { data: obj.data, contentType: obj.contentType } : null;
}

// ---------------------------------------------------------------------------
// Expired stock-hold sweep (cron)
// ---------------------------------------------------------------------------

export async function releaseExpiredHolds(): Promise<{ released: number }> {
  const now = new Date();
  const expired = await db.order.findMany({
    where: {
      status: "AWAITING_PAYMENT",
      holdExpiresAt: { lt: now },
    },
    include: { items: true, payments: true },
    take: 200,
  });

  let released = 0;
  for (const order of expired) {
    // Never auto-fail an order the customer has already claimed to have paid
    // (a SUBMITTED payment) or one that is verified — those need a human. Only
    // truly abandoned holds (no payment, or only an INITIATED stub) are swept.
    if (
      order.payments.some(
        (p) => p.status === "VERIFIED" || p.status === "SUBMITTED",
      )
    ) {
      continue;
    }
    const items: OrderItemLite[] = order.items.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
    }));
    await db.$transaction(async (tx) => {
      await releaseReservation(tx, items);
      await tx.order.update({
        where: { id: order.id },
        data: { paymentStatus: "FAILED", status: "PAYMENT_FAILED" },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: "AWAITING_PAYMENT",
          toStatus: "PAYMENT_FAILED",
          reason: "Payment hold expired",
        },
      });
      await tx.payment.updateMany({
        where: {
          orderId: order.id,
          status: { in: ["INITIATED", "SUBMITTED"] },
        },
        data: { status: "FAILED" },
      });
      await recordAudit(
        { kind: "system" },
        {
          action: "order.hold_expired",
          summary: `Stock hold released for unpaid order ${order.reference}`,
          entityType: "Order",
          entityId: order.id,
          details: { reference: order.reference },
        },
        {},
        tx,
      );
    });
    released += 1;
  }
  return { released };
}
