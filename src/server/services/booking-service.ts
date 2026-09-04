import "server-only";

import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import type { Prisma, OrderStatus } from "@/generated/prisma";
import { requirePermission } from "@/server/rbac/authorize";
import { recordAudit } from "@/server/services/audit";
import { getRequestContext } from "@/server/http/request-context";
import { auditActor } from "@/server/services/_helpers";
import { AppError, NotFoundError, ValidationError } from "@/server/http/errors";
import { logger } from "@/lib/logger";
import type { z } from "zod";
import { env } from "@/env";
import { getStorage } from "@/server/integrations/storage";
import { validatePdfUpload } from "@/lib/pdf-validation";
import {
  bookingOrderIdSchema,
  bookParcelSchema,
  readyToBookFilterSchema,
  coverPrintSchema,
  coverBulkSchema,
  type ReadyToBookFilter,
} from "@/lib/validation/booking";
import { enqueueNotificationSafe } from "@/server/services/notifications-service";
import {
  ensureTrackingTokenForOrder,
  getTrackingUrlForOrder,
} from "@/server/services/tracking-service";
import { getEffectiveSettings } from "@/server/services/settings-service";
import { maskPhone } from "@/lib/notifications/phone";
import { sha256Hex } from "@/server/auth/tokens";

const PAGE_SIZE = 25;
const LR_PREFIX = "lr-docs";

/** Order statuses that belong in the Booking Panel. */
export const BOOKING_ORDER_STATUSES: OrderStatus[] = [
  "PAID",
  "PACKED",
  "PARCEL_BOOKED",
];

/** Parse with a schema, surfacing the first issue as a ValidationError. */
function parseInput<T>(schema: z.ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Please check the details and retry.",
    );
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Console reads
// ---------------------------------------------------------------------------

export async function listBookingOrders(
  filter: { q?: string; status?: string; page?: number } = {},
) {
  await requirePermission("booking.view");
  const page = Math.max(1, Math.floor(filter.page ?? 1));

  const where: Prisma.OrderWhereInput = {
    status: { in: BOOKING_ORDER_STATUSES },
  };
  if (
    filter.status &&
    (BOOKING_ORDER_STATUSES as string[]).includes(filter.status)
  ) {
    where.status = filter.status as OrderStatus;
  }
  if (filter.q) {
    where.AND = [
      {
        OR: [
          { reference: { contains: filter.q, mode: "insensitive" } },
          { customerName: { contains: filter.q, mode: "insensitive" } },
          { customerPhone: { contains: filter.q } },
          {
            booking: {
              is: { lrNumber: { contains: filter.q, mode: "insensitive" } },
            },
          },
        ],
      },
    ];
  }

  const total = await db.order.count({ where });
  const rows = await db.order.findMany({
    where,
    orderBy: [{ status: "asc" }, { placedAt: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      reference: true,
      status: true,
      customerName: true,
      customerPhone: true,
      city: true,
      stateName: true,
      assignedPartnerCode: true,
      placedAt: true,
      _count: { select: { items: true } },
      booking: {
        select: {
          courierName: true,
          lrNumber: true,
          bookingDate: true,
          parcelCount: true,
          packedAt: true,
          parcelBookedAt: true,
          lrDocuments: { where: { isCurrent: true }, select: { id: true } },
        },
      },
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

function loadBookingDetail(orderId: string) {
  return db.order.findUnique({
    where: { id: orderId },
    include: {
      items: { orderBy: { productName: "asc" } },
      assignedPartner: { select: { code: true, name: true } },
      history: {
        orderBy: { createdAt: "asc" },
        include: { changedBy: { select: { code: true } } },
      },
      booking: {
        include: {
          packedBy: { select: { code: true, name: true } },
          parcelBookedBy: { select: { code: true, name: true } },
          lrDocuments: {
            orderBy: { uploadedAt: "desc" },
            include: { uploadedBy: { select: { code: true } } },
          },
        },
      },
    },
  });
}

export async function getBookingForConsole(raw: unknown) {
  await requirePermission("booking.view");
  const { orderId } = parseInput(bookingOrderIdSchema, raw);
  const order = await loadBookingDetail(orderId);
  if (!order) throw new NotFoundError("That order does not exist.");
  return order;
}

// ---------------------------------------------------------------------------
// Ready to Book — a consolidated view of orders ready for parcel booking.
// It is a *derived* view of the existing state machine: an order is "ready to
// book" exactly when it is PACKED and PAID (i.e. `confirmParcelBooked` would
// accept it). No new status column, no parallel workflow.
// ---------------------------------------------------------------------------

const READY_SUMMARY_SCAN_CAP = 5000;
const READY_EXPORT_CAP = 10_000;
const READY_PAGE_SIZE = 30;

function opaqueRef(orderId: string): string {
  return `QC-${sha256Hex(orderId).slice(0, 8).toUpperCase()}`;
}

function buildReadyToBookWhere(f: ReadyToBookFilter): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {
    status: "PACKED",
    paymentStatus: "PAID",
  };

  const bookingWhere: Prisma.BookingWhereInput = {};
  if (f.from) {
    bookingWhere.packedAt = {
      gte: new Date(`${f.from}T00:00:00.000Z`),
    };
  }
  if (f.to) {
    bookingWhere.packedAt = {
      ...(bookingWhere.packedAt as object | undefined),
      lt: new Date(Date.parse(`${f.to}T00:00:00.000Z`) + 86_400_000),
    };
  }
  if (f.courier) {
    bookingWhere.courierName = { contains: f.courier, mode: "insensitive" };
  }
  if (Object.keys(bookingWhere).length > 0) {
    where.booking = { is: bookingWhere };
  }

  if (f.partnerCode) where.assignedPartnerCode = f.partnerCode;
  if (f.city) where.city = { contains: f.city, mode: "insensitive" };
  if (f.pincode) where.pincode = { startsWith: f.pincode };

  if (f.q) {
    where.OR = [
      { reference: { contains: f.q, mode: "insensitive" } },
      { customerName: { contains: f.q, mode: "insensitive" } },
      { customerPhone: { contains: f.q } },
      {
        bill: {
          is: { billNumber: { contains: f.q, mode: "insensitive" } },
        },
      },
    ];
  }
  return where;
}

type ReadyRow = {
  id: string;
  reference: string;
  orderRef: string;
  billNumber: string | null;
  placedAt: Date;
  packedAt: Date | null;
  customerName: string;
  mobileMasked: string;
  city: string;
  stateName: string;
  pincode: string;
  courierName: string | null;
  partnerCode: string | null;
  parcelCount: number;
  parcelCountKnown: boolean;
  itemCount: number;
  totalPaise: number;
  status: string;
};

type ReadySummary = {
  orders: number;
  parcels: number;
  items: number;
  valuePaise: number;
  /** Total weight in grams, or null when any product lacks a reliable weight. */
  weightGrams: number | null;
  /** True when the scan hit its cap and the summary is a lower bound. */
  capped: boolean;
};

async function summariseReady(
  where: Prisma.OrderWhereInput,
): Promise<ReadySummary> {
  const scan = await db.order.findMany({
    where,
    take: READY_SUMMARY_SCAN_CAP + 1,
    select: {
      totalPaise: true,
      booking: { select: { parcelCount: true } },
      items: {
        select: {
          quantity: true,
          product: { select: { weightGrams: true } },
        },
      },
    },
  });
  const capped = scan.length > READY_SUMMARY_SCAN_CAP;
  const rows = capped ? scan.slice(0, READY_SUMMARY_SCAN_CAP) : scan;

  let parcels = 0;
  let items = 0;
  let valuePaise = 0;
  let weightGrams: number | null = 0;
  for (const o of rows) {
    parcels += o.booking?.parcelCount ?? 1;
    valuePaise += o.totalPaise;
    for (const it of o.items) {
      items += it.quantity;
      if (weightGrams !== null) {
        if (it.product?.weightGrams == null) weightGrams = null;
        else weightGrams += it.product.weightGrams * it.quantity;
      }
    }
  }
  return { orders: rows.length, parcels, items, valuePaise, weightGrams, capped };
}

const READY_ROW_SELECT = {
  id: true,
  reference: true,
  placedAt: true,
  customerName: true,
  customerPhone: true,
  city: true,
  stateName: true,
  pincode: true,
  status: true,
  totalPaise: true,
  assignedPartnerCode: true,
  bill: { select: { billNumber: true } },
  booking: {
    select: { packedAt: true, courierName: true, parcelCount: true },
  },
  items: { select: { quantity: true } },
} satisfies Prisma.OrderSelect;

type ReadyRowSource = Prisma.OrderGetPayload<{
  select: typeof READY_ROW_SELECT;
}>;

function mapReadyRow(o: ReadyRowSource): ReadyRow {
  return {
    id: o.id,
    reference: o.reference,
    orderRef: opaqueRef(o.id),
    billNumber: o.bill?.billNumber ?? null,
    placedAt: o.placedAt,
    packedAt: o.booking?.packedAt ?? null,
    customerName: o.customerName,
    mobileMasked: maskPhone(o.customerPhone),
    city: o.city,
    stateName: o.stateName,
    pincode: o.pincode,
    courierName: o.booking?.courierName ?? null,
    partnerCode: o.assignedPartnerCode,
    parcelCount: o.booking?.parcelCount ?? 1,
    parcelCountKnown: o.booking?.parcelCount != null,
    itemCount: o.items.reduce((s, it) => s + it.quantity, 0),
    totalPaise: o.totalPaise,
    status: o.status,
  };
}

/** Paginated Ready to Book list + summary totals for the whole filtered set. */
export async function getReadyToBookOrders(rawFilter: unknown) {
  await requirePermission("booking.view");
  const filter = parseInput(readyToBookFilterSchema, rawFilter ?? {});
  const where = buildReadyToBookWhere(filter);

  const [total, rows, summary] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({
      where,
      orderBy: [{ booking: { packedAt: "asc" } }, { placedAt: "asc" }],
      skip: (filter.page - 1) * READY_PAGE_SIZE,
      take: READY_PAGE_SIZE,
      select: READY_ROW_SELECT,
    }),
    summariseReady(where),
  ]);

  return {
    rows: rows.map(mapReadyRow),
    summary,
    filter,
    total,
    page: filter.page,
    pageSize: READY_PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / READY_PAGE_SIZE)),
  };
}

/** The full filtered Ready to Book set (no pagination) for the consolidated
 *  print report and the CSV export. Capped at {@link READY_EXPORT_CAP}. */
export async function getReadyToBookForReport(rawFilter: unknown) {
  await requirePermission("booking.view");
  const filter = parseInput(readyToBookFilterSchema, rawFilter ?? {});
  const where = buildReadyToBookWhere(filter);

  const [rows, summary] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: [{ booking: { packedAt: "asc" } }, { placedAt: "asc" }],
      take: READY_EXPORT_CAP,
      select: READY_ROW_SELECT,
    }),
    summariseReady(where),
  ]);

  return { rows: rows.map(mapReadyRow), summary, filter };
}

// ---------------------------------------------------------------------------
// Parcel cover print
// ---------------------------------------------------------------------------

export type CoverData = {
  orderId: string;
  orderRef: string;
  billNumber: string | null;
  status: string;
  locale: string;
  customerName: string;
  customerPhone: string;
  address: {
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    pincode: string;
  };
  courierName: string | null;
  parcelCount: number;
  parcelCountKnown: boolean;
  itemCount: number;
  notes: string | null;
  trackingUrl: string | null;
  seller: { name: string; address: string; phone: string };
};

const COVER_ELIGIBLE_STATUSES: OrderStatus[] = [
  "PACKED",
  "PARCEL_BOOKED",
  "COMPLETED",
];

async function loadCover(orderId: string): Promise<CoverData> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      paymentStatus: true,
      locale: true,
      customerName: true,
      customerPhone: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      stateName: true,
      pincode: true,
      notes: true,
      bill: { select: { billNumber: true } },
      booking: { select: { courierName: true, parcelCount: true } },
      items: { select: { quantity: true } },
    },
  });
  if (!order) throw new NotFoundError("That order does not exist.");
  if (
    order.paymentStatus !== "PAID" ||
    !COVER_ELIGIBLE_STATUSES.includes(order.status)
  ) {
    throw new AppError(
      "CONFLICT",
      "A parcel cover can only be printed once the order is paid and packed.",
    );
  }

  // A tracking link the recipient can scan — the same customer-safe view as the
  // rest of the label (no payment / internal data).
  await ensureTrackingTokenForOrder(order.id).catch(() => undefined);
  const trackingUrl = await getTrackingUrlForOrder(order.id).catch(() => null);

  const settings = await getEffectiveSettings();

  return {
    orderId: order.id,
    orderRef: opaqueRef(order.id),
    billNumber: order.bill?.billNumber ?? null,
    status: order.status,
    locale: order.locale,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    address: {
      line1: order.addressLine1,
      line2: order.addressLine2,
      city: order.city,
      state: order.stateName,
      pincode: order.pincode,
    },
    courierName: order.booking?.courierName ?? null,
    parcelCount: order.booking?.parcelCount ?? 1,
    parcelCountKnown: order.booking?.parcelCount != null,
    itemCount: order.items.reduce((s, it) => s + it.quantity, 0),
    notes: order.notes && order.notes.trim() ? order.notes.trim() : null,
    trackingUrl,
    seller: {
      name: settings["business.legalName"],
      address: settings["business.address"],
      phone: settings["business.phone"],
    },
  };
}

/** Cover data for a single order. */
export async function getCoverData(raw: unknown): Promise<CoverData> {
  await requirePermission("booking.view");
  const { orderId } = parseInput(coverPrintSchema, raw);
  return loadCover(orderId);
}

/** Cover data for a set of orders (bulk cover printing). Orders that are not
 *  eligible are silently skipped so one bad id does not break a print run. */
export async function getCoverDataBulk(raw: unknown): Promise<CoverData[]> {
  await requirePermission("booking.view");
  const { orderIds } = parseInput(coverBulkSchema, raw);
  const out: CoverData[] = [];
  for (const id of [...new Set(orderIds)]) {
    try {
      out.push(await loadCover(id));
    } catch {
      /* skip ineligible / missing */
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

async function requireOrder(orderId: string) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { booking: true },
  });
  if (!order) throw new NotFoundError("That order does not exist.");
  return order;
}

/** PAID → PACKED. Creates the booking record. */
export async function markOrderPacked(raw: unknown) {
  const auth = await requirePermission("booking.pack");
  const { orderId } = parseInput(bookingOrderIdSchema, raw);
  const ctx = await getRequestContext();

  const order = await requireOrder(orderId);
  if (order.status === "PACKED" || order.status === "PARCEL_BOOKED") {
    // Idempotent-ish: already past this point.
    throw new ValidationError("This order is already packed.");
  }
  if (order.status !== "PAID") {
    throw new AppError(
      "CONFLICT",
      `Only a paid order can be packed. This order is ${order.status.replace(/_/g, " ").toLowerCase()}.`,
    );
  }

  await db.$transaction(async (tx) => {
    await tx.booking.upsert({
      where: { orderId: order.id },
      create: {
        orderId: order.id,
        packedAt: new Date(),
        packedById: auth.user.id,
      },
      update: { packedAt: new Date(), packedById: auth.user.id },
    });
    await tx.order.update({
      where: { id: order.id },
      data: { status: "PACKED" },
    });
    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: "PACKED",
        changedById: auth.user.id,
        reason: "Order packed",
      },
    });
    await recordAudit(
      auditActor(auth),
      {
        action: "booking.pack",
        summary: `${auth.user.code} marked order ${order.reference} as packed`,
        entityType: "Order",
        entityId: order.id,
        details: { reference: order.reference },
      },
      ctx,
      tx,
    );
  });

  await enqueueNotificationSafe({
    orderId: order.id,
    eventType: "ORDER_PACKED",
  });
  return loadBookingDetail(order.id);
}

/**
 * Confirm PARCEL_BOOKED. Requires the order to be PACKED and all four
 * mandatory courier / LR fields to be valid (schema-checked here, and a DB
 * CHECK backs it up).
 */
export async function confirmParcelBooked(raw: unknown) {
  const auth = await requirePermission("booking.book_parcel");
  const input = parseInput(bookParcelSchema, raw);
  const ctx = await getRequestContext();

  const order = await requireOrder(input.orderId);
  if (order.status === "PARCEL_BOOKED") {
    throw new ValidationError(
      "This parcel is already booked. Use ‘Edit booking details’ to change it.",
    );
  }
  if (order.status !== "PACKED") {
    throw new AppError(
      "CONFLICT",
      order.status === "PAID"
        ? "Mark the order as packed before booking the parcel."
        : `The parcel cannot be booked from status ${order.status.replace(/_/g, " ").toLowerCase()}.`,
    );
  }

  const bookingDate = new Date(`${input.bookingDate}T00:00:00.000Z`);

  await db.$transaction(async (tx) => {
    await tx.booking.update({
      where: { orderId: order.id },
      data: {
        courierName: input.courierName,
        lrNumber: input.lrNumber,
        bookingDate,
        parcelCount: input.parcelCount,
        remarks: input.remarks || null,
        parcelBookedAt: new Date(),
        parcelBookedById: auth.user.id,
      },
    });
    await tx.order.update({
      where: { id: order.id },
      data: { status: "PARCEL_BOOKED" },
    });
    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: "PACKED",
        toStatus: "PARCEL_BOOKED",
        changedById: auth.user.id,
        reason: `Parcel booked — ${input.courierName} / ${input.lrNumber}`,
      },
    });
    await recordAudit(
      auditActor(auth),
      {
        action: "booking.book_parcel",
        summary: `${auth.user.code} booked parcel for order ${order.reference} — ${input.courierName} LR ${input.lrNumber}`,
        entityType: "Order",
        entityId: order.id,
        details: {
          reference: order.reference,
          courierName: input.courierName,
          lrNumber: input.lrNumber,
          bookingDate: input.bookingDate,
          parcelCount: input.parcelCount,
        },
      },
      ctx,
      tx,
    );
  });

  await enqueueNotificationSafe({
    orderId: order.id,
    eventType: "PARCEL_BOOKED",
  });
  return loadBookingDetail(order.id);
}

/**
 * PARCEL_BOOKED → COMPLETED. The final state — the parcel has been delivered /
 * the order is closed. Requires the parcel to be booked and an LR document on
 * file (matches the architecture: "LR uploaded + confirmed → COMPLETED").
 */
export async function markOrderCompleted(raw: unknown) {
  const auth = await requirePermission("booking.book_parcel");
  const { orderId } = parseInput(bookingOrderIdSchema, raw);
  const ctx = await getRequestContext();

  const order = await requireOrder(orderId);
  if (order.status === "COMPLETED") {
    throw new ValidationError("This order is already completed.");
  }
  if (order.status !== "PARCEL_BOOKED") {
    throw new AppError(
      "CONFLICT",
      "Only a parcel-booked order can be marked completed.",
    );
  }
  const lr = await db.lrDocument.findFirst({
    where: { orderId: order.id, isCurrent: true },
    select: { id: true },
  });
  if (!lr) {
    throw new AppError(
      "CONFLICT",
      "Upload the LR document before completing the order.",
    );
  }

  await db.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: { status: "COMPLETED" },
    });
    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: "PARCEL_BOOKED",
        toStatus: "COMPLETED",
        changedById: auth.user.id,
        reason: "Order completed / delivered",
      },
    });
    await recordAudit(
      auditActor(auth),
      {
        action: "booking.complete",
        summary: `${auth.user.code} completed order ${order.reference}`,
        entityType: "Order",
        entityId: order.id,
        details: { reference: order.reference },
      },
      ctx,
      tx,
    );
  });

  return loadBookingDetail(order.id);
}

/** Edit courier / LR details on an already-booked parcel (no status change). */
export async function updateBookingDetails(raw: unknown) {
  const auth = await requirePermission("booking.book_parcel");
  const input = parseInput(bookParcelSchema, raw);
  const ctx = await getRequestContext();

  const order = await requireOrder(input.orderId);
  if (order.status !== "PARCEL_BOOKED") {
    throw new AppError(
      "CONFLICT",
      "Booking details can only be edited after the parcel is booked.",
    );
  }

  const before = order.booking;
  const bookingDate = new Date(`${input.bookingDate}T00:00:00.000Z`);

  await db.$transaction(async (tx) => {
    await tx.booking.update({
      where: { orderId: order.id },
      data: {
        courierName: input.courierName,
        lrNumber: input.lrNumber,
        bookingDate,
        parcelCount: input.parcelCount,
        remarks: input.remarks || null,
      },
    });
    await recordAudit(
      auditActor(auth),
      {
        action: "booking.update",
        summary: `${auth.user.code} edited booking details for order ${order.reference}`,
        entityType: "Order",
        entityId: order.id,
        details: {
          reference: order.reference,
          courierName: { from: before?.courierName, to: input.courierName },
          lrNumber: { from: before?.lrNumber, to: input.lrNumber },
          parcelCount: { from: before?.parcelCount, to: input.parcelCount },
        },
      },
      ctx,
      tx,
    );
  });

  return loadBookingDetail(order.id);
}

// ---------------------------------------------------------------------------
// LR document upload / download
// ---------------------------------------------------------------------------

/**
 * Upload (or replace) the LR / parcel-booking PDF for an order. The previous
 * current document is kept as history (`isCurrent = false`, `supersededAt`).
 */
export async function uploadLrDocument(
  rawOrderId: unknown,
  bytes: Uint8Array,
  originalFilename: string,
) {
  const auth = await requirePermission("lr.upload");
  const { orderId } = parseInput(
    bookingOrderIdSchema,
    typeof rawOrderId === "object" && rawOrderId !== null
      ? rawOrderId
      : { orderId: rawOrderId },
  );
  const ctx = await getRequestContext();

  const check = validatePdfUpload(bytes, env.STORAGE_MAX_DOCUMENT_BYTES);
  if (!check.ok) throw new ValidationError(check.error);

  const order = await requireOrder(orderId);
  if (order.status !== "PACKED" && order.status !== "PARCEL_BOOKED") {
    throw new AppError(
      "CONFLICT",
      "An LR document can only be uploaded once the order is packed.",
    );
  }
  if (!order.booking) {
    throw new AppError("CONFLICT", "Mark the order as packed first.");
  }

  const safeName =
    originalFilename
      .replace(/[^\w.\- ]+/g, "")
      .trim()
      .slice(0, 120) || "lr.pdf";
  const key = `${LR_PREFIX}/${randomUUID()}.pdf`;
  await getStorage().put(key, bytes, "application/pdf");

  try {
    await db.$transaction(async (tx) => {
      await tx.lrDocument.updateMany({
        where: { orderId: order.id, isCurrent: true },
        data: { isCurrent: false, supersededAt: new Date() },
      });
      await tx.lrDocument.create({
        data: {
          bookingId: order.booking!.id,
          orderId: order.id,
          storageKey: key,
          originalFilename: safeName,
          byteSize: bytes.length,
          isCurrent: true,
          uploadedById: auth.user.id,
        },
      });
      await recordAudit(
        auditActor(auth),
        {
          action: "lr.upload",
          summary: `${auth.user.code} uploaded an LR document for order ${order.reference}`,
          entityType: "Order",
          entityId: order.id,
          details: { reference: order.reference, filename: safeName },
        },
        ctx,
        tx,
      );
    });
  } catch (err) {
    await getStorage()
      .delete(key)
      .catch(() => undefined);
    throw err;
  }

  await enqueueNotificationSafe({
    orderId: order.id,
    eventType: "LR_AVAILABLE",
  });
  return loadBookingDetail(order.id);
}

async function currentLrObject(orderId: string) {
  const doc = await db.lrDocument.findFirst({
    where: { orderId, isCurrent: true },
  });
  if (!doc) return null;
  const obj = await getStorage().get(doc.storageKey);
  if (!obj) {
    logger.error("lr.blob_missing", { orderId, storageKey: doc.storageKey });
    return null;
  }
  return { doc, data: obj.data };
}

/** Console download — requires `lr.download`. */
export async function getLrDocumentBytes(raw: unknown) {
  const auth = await requirePermission("lr.download");
  const { orderId } = parseInput(bookingOrderIdSchema, raw);
  const ctx = await getRequestContext();

  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { reference: true },
  });
  if (!order) throw new NotFoundError("That order does not exist.");

  const current = await currentLrObject(orderId);
  if (!current) throw new NotFoundError("No LR document has been uploaded.");

  await recordAudit(
    auditActor(auth),
    {
      action: "lr.download",
      summary: `${auth.user.code} downloaded the LR document for order ${order.reference}`,
      entityType: "Order",
      entityId: orderId,
      details: { reference: order.reference },
    },
    ctx,
  );

  return {
    data: current.data,
    filename: current.doc.originalFilename.endsWith(".pdf")
      ? current.doc.originalFilename
      : `${current.doc.originalFilename}.pdf`,
  };
}

// Customer-facing tracking (the public tracking page, LR copy, and the
// tracking-token lifecycle) lives in `tracking-service.ts` (Phase 7).
