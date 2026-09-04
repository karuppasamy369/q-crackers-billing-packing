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
} from "@/lib/validation/booking";
import { enqueueNotificationSafe } from "@/server/services/notifications-service";

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
