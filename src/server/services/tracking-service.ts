import "server-only";

import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma";
import { requirePermission } from "@/server/rbac/authorize";
import { recordAudit } from "@/server/services/audit";
import { getRequestContext } from "@/server/http/request-context";
import { auditActor } from "@/server/services/_helpers";
import { NotFoundError, AppError } from "@/server/http/errors";
import { rateLimit } from "@/lib/rate-limit";
import { hmacBase64Url, sha256Hex } from "@/server/auth/tokens";
import { getStorage } from "@/server/integrations/storage";
import { env } from "@/env";
import { orderReferenceSchema } from "@/lib/validation/checkout";
import {
  trackingTokenSchema,
  trackingOrderIdSchema,
} from "@/lib/validation/tracking";

// ---------------------------------------------------------------------------
// Constants + token derivation
// ---------------------------------------------------------------------------

/**
 * The key the tracking token is derived from. An explicit `TRACKING_LINK_SECRET`
 * is used when set; otherwise a stable value is derived from `DATABASE_URL` so
 * local/dev works with no config. Either way a `tracking_tokens` leak on its
 * own is useless — you also need this key to compute a working token.
 */
function linkSecret(): string {
  return (
    env.TRACKING_LINK_SECRET ??
    sha256Hex(`qc-tracking-link::${env.DATABASE_URL}`)
  );
}

/** The raw token for an order at a given rotation version — always rebuildable. */
function deriveTrackingToken(orderId: string, linkVersion: number): string {
  return hmacBase64Url(linkSecret(), `${orderId}:${linkVersion}`);
}

/** Order statuses whose orders may be tracked publicly. Anything else (an
 *  unpaid / failed order) resolves to a generic "not found". */
const TRACKABLE_STATUSES = [
  "PAID",
  "PACKED",
  "PARCEL_BOOKED",
  "COMPLETED",
  "CANCELLED",
  "REFUNDED",
] as const;

const VIEW_RATE_MAX = 60;
const VIEW_RATE_WINDOW_MS = 10 * 60_000;
const LR_RATE_MAX = 15;
const LR_RATE_WINDOW_MS = 10 * 60_000;

/** One generic error for every public failure — never reveals whether an
 *  order exists, is unpaid, cancelled, or the token is simply wrong. */
function notTrackable(): never {
  throw new NotFoundError("This tracking link is not valid or has expired.");
}

export function hashTrackingToken(raw: string): string {
  return sha256Hex(raw);
}

// ---------------------------------------------------------------------------
// Public tracking DTO — the ONLY shape returned to the browser. No database
// ids, addresses, phone numbers, payment data, staff / partner details, or
// internal notes.
// ---------------------------------------------------------------------------

export type TrackingStageKey =
  | "PAYMENT"
  | "PACKED"
  | "PARCEL_BOOKED"
  | "LR_AVAILABLE"
  | "REVIEW";

export type TrackingStageState = "complete" | "current" | "pending";

export type TrackingStage = {
  key: TrackingStageKey;
  state: TrackingStageState;
  at: string | null; // ISO timestamp, when known
};

export type PublicTrackingDto = {
  /** Opaque, non-reversible display code, safe to show / quote to support. */
  publicRef: string;
  /** Customer-facing status label key (maps to i18n). */
  status: "PAID" | "PACKED" | "PARCEL_BOOKED" | "COMPLETED" | "CANCELLED";
  cancelled: boolean;
  placedAt: string;
  paymentAt: string | null;
  packedAt: string | null;
  parcelBookedAt: string | null;
  cancelledAt: string | null;
  courierName: string | null;
  lrNumber: string | null;
  bookingDate: string | null;
  parcelCount: number | null;
  lrAvailable: boolean;
  itemCount: number;
  destination: { city: string; state: string } | null;
  stages: TrackingStage[];
};

// ---------------------------------------------------------------------------
// DTO builder — pure mapping from an already-loaded order graph
// ---------------------------------------------------------------------------

type OrderForTracking = Prisma.OrderGetPayload<{
  select: {
    id: true;
    status: true;
    placedAt: true;
    city: true;
    stateName: true;
    booking: {
      select: {
        packedAt: true;
        parcelBookedAt: true;
        courierName: true;
        lrNumber: true;
        bookingDate: true;
        parcelCount: true;
        lrDocuments: { select: { id: true } };
      };
    };
    history: {
      select: { toStatus: true; createdAt: true };
    };
    _count: { select: { items: true } };
  };
}>;

const ORDER_TRACKING_SELECT = {
  id: true,
  status: true,
  placedAt: true,
  city: true,
  stateName: true,
  booking: {
    select: {
      packedAt: true,
      parcelBookedAt: true,
      courierName: true,
      lrNumber: true,
      bookingDate: true,
      parcelCount: true,
      lrDocuments: {
        where: { isCurrent: true },
        select: { id: true },
      },
    },
  },
  history: {
    orderBy: { createdAt: "asc" },
    select: { toStatus: true, createdAt: true },
  },
  _count: { select: { items: true } },
} satisfies Prisma.OrderSelect;

function firstHistoryAt(
  history: { toStatus: string; createdAt: Date }[],
  status: string,
): string | null {
  const row = history.find((h) => h.toStatus === status);
  return row ? row.createdAt.toISOString() : null;
}

function buildTrackingDto(order: OrderForTracking): PublicTrackingDto {
  const b = order.booking;
  const cancelled = order.status === "CANCELLED" || order.status === "REFUNDED";
  const lrAvailable = (b?.lrDocuments.length ?? 0) > 0;

  const paymentAt = firstHistoryAt(order.history, "PAID");
  const packedAt =
    b?.packedAt?.toISOString() ?? firstHistoryAt(order.history, "PACKED");
  const parcelBookedAt =
    b?.parcelBookedAt?.toISOString() ??
    firstHistoryAt(order.history, "PARCEL_BOOKED");
  const cancelledAt = cancelled
    ? (firstHistoryAt(order.history, "CANCELLED") ??
      firstHistoryAt(order.history, "REFUNDED"))
    : null;

  // Courier / LR details are only meaningful once the parcel is actually
  // booked.
  const booked = Boolean(parcelBookedAt);

  const done = {
    PAYMENT: Boolean(paymentAt),
    PACKED: Boolean(packedAt),
    PARCEL_BOOKED: booked,
    LR_AVAILABLE: lrAvailable,
    REVIEW: false, // reviews arrive in a later phase
  };

  const order_: TrackingStageKey[] = [
    "PAYMENT",
    "PACKED",
    "PARCEL_BOOKED",
    "LR_AVAILABLE",
    "REVIEW",
  ];
  const at: Record<TrackingStageKey, string | null> = {
    PAYMENT: paymentAt,
    PACKED: packedAt,
    PARCEL_BOOKED: parcelBookedAt,
    LR_AVAILABLE: lrAvailable ? parcelBookedAt : null,
    REVIEW: null,
  };

  let currentAssigned = false;
  const stages: TrackingStage[] = order_.map((key) => {
    if (done[key]) return { key, state: "complete" as const, at: at[key] };
    if (!currentAssigned && !cancelled) {
      currentAssigned = true;
      return { key, state: "current" as const, at: null };
    }
    return { key, state: "pending" as const, at: null };
  });

  const displayStatus: PublicTrackingDto["status"] = cancelled
    ? "CANCELLED"
    : order.status === "COMPLETED"
      ? "COMPLETED"
      : order.status === "PARCEL_BOOKED"
        ? "PARCEL_BOOKED"
        : order.status === "PACKED"
          ? "PACKED"
          : "PAID";

  return {
    publicRef: `QC-${sha256Hex(order.id).slice(0, 8).toUpperCase()}`,
    status: displayStatus,
    cancelled,
    placedAt: order.placedAt.toISOString(),
    paymentAt,
    packedAt,
    parcelBookedAt,
    cancelledAt,
    courierName: booked ? (b?.courierName ?? null) : null,
    lrNumber: booked ? (b?.lrNumber ?? null) : null,
    bookingDate: booked ? (b?.bookingDate?.toISOString() ?? null) : null,
    parcelCount: booked ? (b?.parcelCount ?? null) : null,
    lrAvailable,
    itemCount: order._count.items,
    destination: cancelled
      ? null
      : { city: order.city, state: order.stateName },
    stages,
  };
}

// ---------------------------------------------------------------------------
// Resolution (public) — hash-based, generic failure
// ---------------------------------------------------------------------------

async function resolveOrderIdByToken(rawToken: string): Promise<string> {
  const parsed = trackingTokenSchema.safeParse(rawToken);
  if (!parsed.success) notTrackable();

  const tokenHash = hashTrackingToken(parsed.data);
  const row = await db.trackingToken.findUnique({
    where: { tokenHash },
    select: { orderId: true, revokedAt: true, expiresAt: true },
  });
  if (!row || row.revokedAt) notTrackable();
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) notTrackable();
  return row.orderId;
}

async function loadTrackableOrder(where: Prisma.OrderWhereUniqueInput) {
  const order = await db.order.findUnique({
    where,
    select: {
      ...ORDER_TRACKING_SELECT,
      paymentStatus: true,
    },
  });
  if (!order) notTrackable();
  if (
    order.paymentStatus !== "PAID" ||
    !(TRACKABLE_STATUSES as readonly string[]).includes(order.status)
  ) {
    notTrackable();
  }
  return order;
}

async function checkViewRateLimit() {
  const ctx = await getRequestContext();
  const rl = rateLimit(
    `track:view:${ctx.ip ?? "unknown"}`,
    VIEW_RATE_MAX,
    VIEW_RATE_WINDOW_MS,
  );
  if (!rl.allowed) {
    throw new AppError(
      "RATE_LIMITED",
      "Too many requests. Please wait a minute and try again.",
    );
  }
}

/** Public tracking page, resolved by the shareable token. */
export async function getPublicTrackingByToken(
  rawToken: string,
): Promise<PublicTrackingDto> {
  await checkViewRateLimit();
  const orderId = await resolveOrderIdByToken(rawToken);
  const order = await loadTrackableOrder({ id: orderId });
  return buildTrackingDto(order);
}

/**
 * Tracking view for the customer's own order-confirmation page, resolved by
 * the order reference the customer already holds. Server-only (no public
 * route) — the confirmation page is already gated by that reference.
 */
export async function getPublicTrackingByReference(
  rawReference: string,
): Promise<PublicTrackingDto | null> {
  const parsed = orderReferenceSchema.safeParse(rawReference);
  if (!parsed.success) return null;
  const order = await db.order.findUnique({
    where: { reference: parsed.data },
    select: { ...ORDER_TRACKING_SELECT, paymentStatus: true },
  });
  if (
    !order ||
    order.paymentStatus !== "PAID" ||
    !(TRACKABLE_STATUSES as readonly string[]).includes(order.status)
  ) {
    return null;
  }
  return buildTrackingDto(order);
}

// ---------------------------------------------------------------------------
// LR copy (public)
// ---------------------------------------------------------------------------

async function currentLrBytesForOrder(orderId: string) {
  const doc = await db.lrDocument.findFirst({
    where: { orderId, isCurrent: true },
    select: { id: true, storageKey: true, orderId: true },
  });
  if (!doc || doc.orderId !== orderId) notTrackable();
  const obj = await getStorage().get(doc.storageKey);
  if (!obj) notTrackable();
  return obj.data;
}

async function checkLrRateLimit() {
  const ctx = await getRequestContext();
  const rl = rateLimit(
    `track:lr:${ctx.ip ?? "unknown"}`,
    LR_RATE_MAX,
    LR_RATE_WINDOW_MS,
  );
  if (!rl.allowed) {
    throw new AppError(
      "RATE_LIMITED",
      "Too many download attempts. Please wait a few minutes.",
    );
  }
}

export async function getPublicTrackingLrByToken(rawToken: string) {
  await checkLrRateLimit();
  const orderId = await resolveOrderIdByToken(rawToken);
  const order = await loadTrackableOrder({ id: orderId });
  const data = await currentLrBytesForOrder(orderId);
  return { data, filename: `LR-${buildTrackingDto(order).publicRef}.pdf` };
}

export async function getPublicTrackingLrByReference(rawReference: string) {
  await checkLrRateLimit();
  const parsed = orderReferenceSchema.safeParse(rawReference);
  if (!parsed.success) notTrackable();
  const order = await db.order.findUnique({
    where: { reference: parsed.data },
    select: { id: true, status: true, paymentStatus: true },
  });
  if (
    !order ||
    order.paymentStatus !== "PAID" ||
    !(TRACKABLE_STATUSES as readonly string[]).includes(order.status)
  ) {
    notTrackable();
  }
  const data = await currentLrBytesForOrder(order.id);
  return {
    data,
    filename: `LR-QC-${sha256Hex(order.id).slice(0, 8).toUpperCase()}.pdf`,
  };
}

// ---------------------------------------------------------------------------
// Token lifecycle
// ---------------------------------------------------------------------------

async function orderIsTokenEligible(orderId: string): Promise<boolean> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { status: true, paymentStatus: true },
  });
  return Boolean(
    order &&
      order.paymentStatus === "PAID" &&
      (TRACKABLE_STATUSES as readonly string[]).includes(order.status),
  );
}

/**
 * Idempotently make sure an eligible order has an active tracking token.
 * Returns the raw token ONLY on the call that actually creates it — the hash
 * is all that is stored, so it cannot be re-derived later. Safe to call from
 * the confirmation page on every render.
 */
export async function ensureTrackingTokenForOrder(orderId: string): Promise<{
  created: boolean;
  token: string | null;
}> {
  if (!(await orderIsTokenEligible(orderId)))
    return { created: false, token: null };

  const existing = await db.trackingToken.findUnique({
    where: { orderId },
    select: { id: true, revokedAt: true, linkVersion: true },
  });
  if (existing && !existing.revokedAt) return { created: false, token: null };

  // A revoked token is being re-enabled → bump the version so the old link
  // (which may have leaked) stays dead. A brand-new token starts at version 1.
  const linkVersion = existing ? existing.linkVersion + 1 : 1;
  const raw = deriveTrackingToken(orderId, linkVersion);
  const tokenHash = hashTrackingToken(raw);

  try {
    if (existing) {
      await db.trackingToken.update({
        where: { orderId },
        data: {
          tokenHash,
          linkVersion,
          revokedAt: null,
          revokedById: null,
          rotatedAt: new Date(),
        },
      });
    } else {
      await db.trackingToken.create({ data: { orderId, tokenHash } });
    }
  } catch (err) {
    // A concurrent create won the unique(orderId) race — treat as "already
    // provisioned", no raw token to hand back.
    if (
      err instanceof Error &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      return { created: false, token: null };
    }
    throw err;
  }

  await recordAudit(
    { kind: "system" },
    {
      action: "tracking.token_issued",
      summary: `Tracking link provisioned for order ${orderId}`,
      entityType: "Order",
      entityId: orderId,
    },
    await getRequestContext(),
  );
  return { created: true, token: raw };
}

/** As {@link ensureTrackingTokenForOrder}, resolved by the customer's own
 *  order reference. Used by the confirmation page. */
export async function ensureTrackingTokenByReference(
  rawReference: string,
): Promise<{ created: boolean; token: string | null }> {
  const parsed = orderReferenceSchema.safeParse(rawReference);
  if (!parsed.success) return { created: false, token: null };
  const order = await db.order.findUnique({
    where: { reference: parsed.data },
    select: { id: true },
  });
  if (!order) return { created: false, token: null };
  return ensureTrackingTokenForOrder(order.id);
}

async function rotateHash(orderId: string, actorId: string | null) {
  const existing = await db.trackingToken.findUnique({
    where: { orderId },
    select: { linkVersion: true },
  });
  const linkVersion = (existing?.linkVersion ?? 0) + 1;
  const token = deriveTrackingToken(orderId, linkVersion);
  await db.trackingToken.upsert({
    where: { orderId },
    create: {
      orderId,
      tokenHash: hashTrackingToken(token),
      linkVersion,
      createdById: actorId,
    },
    update: {
      tokenHash: hashTrackingToken(token),
      linkVersion,
      revokedAt: null,
      revokedById: null,
      rotatedAt: new Date(),
    },
  });
  return token;
}

/**
 * The current shareable tracking URL for an order, rebuilt from the stored
 * rotation version — or `null` when there is no active token / the order is not
 * trackable. Server-only; used to put a link into a WhatsApp notification and
 * to show it in the console.
 */
export async function getTrackingUrlForOrder(
  orderId: string,
): Promise<string | null> {
  const row = await db.trackingToken.findUnique({
    where: { orderId },
    select: { linkVersion: true, revokedAt: true, expiresAt: true },
  });
  if (!row || row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;
  const token = deriveTrackingToken(orderId, row.linkVersion);
  return `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/track/${token}`;
}

/**
 * Customer-facing: (re)generate the shareable tracking link for the customer's
 * own order, authorised by the order reference they already hold (the same
 * bearer capability the confirmation page uses). Rate-limited; returns the raw
 * token once.
 */
export async function rotateTrackingTokenByReference(
  rawReference: string,
): Promise<{ token: string }> {
  const ctx = await getRequestContext();
  const rl = rateLimit(`track:rotate:${ctx.ip ?? "unknown"}`, 10, 10 * 60_000);
  if (!rl.allowed) {
    throw new AppError(
      "RATE_LIMITED",
      "Too many attempts. Please wait a few minutes and try again.",
    );
  }

  const parsed = orderReferenceSchema.safeParse(rawReference);
  if (!parsed.success) notTrackable();
  const order = await db.order.findUnique({
    where: { reference: parsed.data },
    select: { id: true, status: true, paymentStatus: true },
  });
  if (
    !order ||
    order.paymentStatus !== "PAID" ||
    !(TRACKABLE_STATUSES as readonly string[]).includes(order.status)
  ) {
    notTrackable();
  }

  const token = await rotateHash(order.id, null);
  await recordAudit(
    { kind: "system" },
    {
      action: "tracking.token_rotated",
      summary: `Customer regenerated the tracking link for order ${order.id}`,
      entityType: "Order",
      entityId: order.id,
    },
    ctx,
  );
  return { token };
}

/**
 * Console: rotate (generate a fresh) tracking link and return it once.
 * Any previously shared link stops working immediately.
 */
export async function regenerateTrackingToken(raw: unknown): Promise<{
  token: string;
}> {
  const auth = await requirePermission("tracking.manage");
  const { orderId } = trackingOrderIdSchema.parse(raw);
  const ctx = await getRequestContext();

  if (!(await orderIsTokenEligible(orderId))) {
    throw new AppError(
      "CONFLICT",
      "A tracking link can only be issued for a paid order.",
    );
  }

  const token = await rotateHash(orderId, auth.user.id);

  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { reference: true },
  });
  await recordAudit(
    auditActor(auth),
    {
      action: "tracking.token_rotated",
      summary: `${auth.user.code} generated a new tracking link for order ${order.reference}`,
      entityType: "Order",
      entityId: orderId,
    },
    ctx,
  );

  return { token };
}

/** Console: revoke the tracking link. Existing links stop working at once. */
export async function revokeTrackingToken(raw: unknown): Promise<void> {
  const auth = await requirePermission("tracking.manage");
  const { orderId } = trackingOrderIdSchema.parse(raw);
  const ctx = await getRequestContext();

  const existing = await db.trackingToken.findUnique({ where: { orderId } });
  if (!existing || existing.revokedAt) return;

  await db.trackingToken.update({
    where: { orderId },
    data: { revokedAt: new Date(), revokedById: auth.user.id },
  });

  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { reference: true },
  });
  await recordAudit(
    auditActor(auth),
    {
      action: "tracking.token_revoked",
      summary: `${auth.user.code} revoked the tracking link for order ${order.reference}`,
      entityType: "Order",
      entityId: orderId,
    },
    ctx,
  );
}

export type TrackingAdminInfo = {
  status: "none" | "active" | "revoked";
  createdAt: string | null;
  rotatedAt: string | null;
  revokedAt: string | null;
  eligible: boolean;
};

/** Console: whether a tracking link exists for an order (never the raw value). */
export async function getTrackingAdminInfo(
  orderId: string,
): Promise<TrackingAdminInfo> {
  await requirePermission("orders.view");
  const [row, eligible] = await Promise.all([
    db.trackingToken.findUnique({ where: { orderId } }),
    orderIsTokenEligible(orderId),
  ]);
  return {
    status: !row ? "none" : row.revokedAt ? "revoked" : "active",
    createdAt: row?.createdAt.toISOString() ?? null,
    rotatedAt: row?.rotatedAt?.toISOString() ?? null,
    revokedAt: row?.revokedAt?.toISOString() ?? null,
    eligible,
  };
}
