import "server-only";

import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import type { Prisma, PrismaClient } from "@/generated/prisma";
import { requirePermission } from "@/server/rbac/authorize";
import { recordAudit } from "@/server/services/audit";
import { getRequestContext } from "@/server/http/request-context";
import { getEffectiveSettings } from "@/server/services/settings-service";
import { auditActor } from "@/server/services/_helpers";
import { AppError, NotFoundError, ValidationError } from "@/server/http/errors";
import { getStorage } from "@/server/integrations/storage";
import { isTest } from "@/env";
import { formatPaise } from "@/lib/money";
import { logger } from "@/lib/logger";
import { normalizeIndianMobile, stateNameForCode } from "@/lib/india";
import { indianFiscalYear } from "@/lib/fiscal-year";
import { formatBillNumber } from "@/lib/bill-number";
import { computeInvoice, splitGst, type InvoiceLine } from "@/lib/pricing";
import {
  counterBillSchema,
  cancelBillSchema,
  issueBillForOrderSchema,
  billIdSchema,
} from "@/lib/validation/billing";
import { renderBillPdf } from "@/server/billing/pdf";

type Tx = Prisma.TransactionClient;
type AnyDb = PrismaClient | Tx;

const BILL_PDF_PREFIX = "bills";
const PAGE_SIZE = 25;

// ---------------------------------------------------------------------------
// Bill-number allocation — atomic, per (code, fiscalYear)
// ---------------------------------------------------------------------------

/**
 * Allocate the next sequence number for a code + fiscal year. The
 * INSERT … ON CONFLICT DO UPDATE takes a row lock, so concurrent transactions
 * serialise and every caller gets a distinct, gap-free number.
 * MUST be called inside a transaction.
 */
export async function allocateBillNumber(
  tx: Tx,
  userCode: string,
  fiscalYear: number,
): Promise<{ sequenceNo: number; billNumber: string; fiscalYear: number }> {
  const rows = await tx.$queryRaw<{ lastNumber: number }[]>`
    INSERT INTO "bill_sequences" ("userCode", "fiscalYear", "lastNumber", "updatedAt", "createdAt")
    VALUES (${userCode}, ${fiscalYear}, 1, now(), now())
    ON CONFLICT ("userCode", "fiscalYear")
    DO UPDATE SET "lastNumber" = "bill_sequences"."lastNumber" + 1, "updatedAt" = now()
    RETURNING "lastNumber"`;
  const sequenceNo = rows[0]!.lastNumber;
  return {
    sequenceNo,
    fiscalYear,
    billNumber: formatBillNumber(userCode, fiscalYear, sequenceNo),
  };
}

// ---------------------------------------------------------------------------
// Seller (business) snapshot
// ---------------------------------------------------------------------------

async function sellerSnapshot() {
  const s = await getEffectiveSettings();
  return {
    name: s["business.legalName"],
    gstin: s["business.gstin"] || null,
    stateCode: s["business.stateCode"],
    address: s["business.address"] || null,
    pricesIncludeGst: s["tax.pricesIncludeGst"],
    housePartnerCode: s["billing.housePartnerCode"],
  };
}

// ---------------------------------------------------------------------------
// Issue a bill for a PAID online order (house-partner code)
// ---------------------------------------------------------------------------

export async function issueBillForOrder(raw: unknown) {
  const auth = await requirePermission("billing.create");
  const { orderId } = issueBillForOrderSchema.parse(raw);
  const ctx = await getRequestContext();

  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { items: true, bill: true },
  });
  if (!order) throw new NotFoundError("That order does not exist.");
  if (order.bill) return getBill({ id: order.bill.id });

  if (order.paymentStatus !== "PAID") {
    throw new ValidationError(
      "A bill can only be generated for an order whose payment is confirmed.",
    );
  }

  const bill = await issueBillForOrderCore(order, order.items, auth.user, ctx);
  await safeGeneratePdf(bill.id);
  return getBill({ id: bill.id });
}

type OrderForBill = {
  id: string;
  reference: string;
  customerId: string;
  assignedPartnerCode: string | null;
  stateCode: string;
  stateName: string;
  customerName: string;
  customerPhone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  subtotalPaise: number;
  taxPaise: number;
  shippingPaise: number;
  totalPaise: number;
};

type OrderItemForBill = {
  productId: string;
  sku: string;
  productName: string;
  unitPricePaise: number;
  gstRateBp: number;
  quantity: number;
  lineSubtotalPaise: number;
  lineTaxPaise: number;
};

/**
 * The bill-issuing core — no permission check, no `raw` parsing. Shared by the
 * permissioned `issueBillForOrder` and by payment verification. Allocates the
 * number under the order's **assigned partner** (falling back to the configured
 * house partner) and copies the order's own amounts so the bill matches
 * exactly what the customer paid.
 */
export async function issueBillForOrderCore(
  order: OrderForBill,
  items: OrderItemForBill[],
  actor: { id: string; code: string; role: string },
  ctx: Awaited<ReturnType<typeof getRequestContext>>,
) {
  const existing = await db.bill.findUnique({ where: { orderId: order.id } });
  if (existing) return existing;

  const seller = await sellerSnapshot();
  const code = order.assignedPartnerCode || seller.housePartnerCode;
  const partnerUser = await db.user.findUnique({
    where: { code },
    include: { role: true },
  });
  if (!partnerUser || partnerUser.role.key !== "PARTNER") {
    throw new AppError(
      "INTERNAL",
      `Bill code "${code}" is not a valid partner account. Fix it in Settings.`,
    );
  }

  const intraState = order.stateCode === seller.stateCode;
  const fiscalYear = indianFiscalYear();

  const lineData = items.map((it) => {
    const split = splitGst(it.lineTaxPaise, intraState);
    return {
      productId: it.productId,
      sku: it.sku,
      name: it.productName,
      hsnCode: null as string | null,
      unitPricePaise: it.unitPricePaise,
      gstRateBp: it.gstRateBp,
      quantity: it.quantity,
      discountPaise: 0,
      taxableValuePaise: it.lineSubtotalPaise,
      ...split,
      lineTotalPaise:
        it.lineSubtotalPaise +
        split.cgstPaise +
        split.sgstPaise +
        split.igstPaise,
    };
  });
  const totalTax = splitGst(order.taxPaise, intraState);

  const bill = await db.$transaction(async (tx) => {
    const allocated = await allocateBillNumber(tx, code, fiscalYear);
    const created = await tx.bill.create({
      data: {
        billNumber: allocated.billNumber,
        userCode: code,
        fiscalYear,
        sequenceNo: allocated.sequenceNo,
        type: "ONLINE_ORDER",
        createdById: actor.id,
        orderId: order.id,
        customerId: order.customerId,
        sellerName: seller.name,
        sellerGstin: seller.gstin,
        sellerStateCode: seller.stateCode,
        sellerAddress: seller.address,
        buyerName: order.customerName,
        buyerPhone: order.customerPhone,
        buyerGstin: null,
        buyerAddress: [order.addressLine1, order.addressLine2, order.city]
          .filter(Boolean)
          .join(", "),
        buyerStateCode: order.stateCode,
        buyerStateName: order.stateName,
        intraState,
        paymentMode: "ONLINE",
        subtotalPaise: order.subtotalPaise,
        discountPaise: 0,
        taxableValuePaise: order.subtotalPaise,
        cgstPaise: totalTax.cgstPaise,
        sgstPaise: totalTax.sgstPaise,
        igstPaise: totalTax.igstPaise,
        shippingPaise: order.shippingPaise,
        roundOffPaise: 0,
        totalPaise: order.totalPaise,
        items: { create: lineData },
      },
    });

    await recordAudit(
      { kind: "user", userId: actor.id, code: actor.code, role: actor.role },
      {
        action: "bill.issue",
        summary: `${actor.code} issued bill ${created.billNumber} for online order ${order.reference}`,
        entityType: "Bill",
        entityId: created.id,
        details: {
          billNumber: created.billNumber,
          orderId: order.id,
          userCode: code,
          totalPaise: created.totalPaise,
        },
      },
      ctx,
      tx,
    );
    return created;
  });

  return bill;
}

// ---------------------------------------------------------------------------
// Counter / walk-in bill (creator's own code)
// ---------------------------------------------------------------------------

export async function createCounterBill(raw: unknown) {
  const auth = await requirePermission("billing.create");
  const input = counterBillSchema.parse(raw);
  const ctx = await getRequestContext();

  const seller = await sellerSnapshot();
  const buyerStateCode = input.customer.stateCode;
  const intraState = buyerStateCode === seller.stateCode;
  const fiscalYear = indianFiscalYear();

  const products = await db.product.findMany({
    where: { id: { in: input.items.map((i) => i.productId) } },
    include: { inventory: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  for (const item of input.items) {
    const p = byId.get(item.productId);
    if (!p || !p.isActive) {
      throw new ValidationError(
        `${p?.name ?? "An item"} is not available for billing.`,
      );
    }
    const available =
      (p.inventory?.quantityOnHand ?? 0) - (p.inventory?.quantityReserved ?? 0);
    if (item.quantity > available) {
      throw new ValidationError(
        available <= 0
          ? `${p.name} is out of stock.`
          : `Only ${available} of ${p.name} available.`,
      );
    }
  }

  const invoice = computeInvoice(
    input.items.map((i) => {
      const p = byId.get(i.productId)!;
      return {
        unitPricePaise: p.pricePaise,
        gstRateBp: p.gstRateBp,
        quantity: i.quantity,
      };
    }),
    { pricesIncludeGst: seller.pricesIncludeGst, intraState },
  );

  const phoneNormalized = input.customer.phone
    ? normalizeIndianMobile(input.customer.phone)
    : null;

  const productIds = input.items.map((i) => i.productId).sort();

  const bill = await db.$transaction(async (tx) => {
    for (const id of productIds) {
      await tx.$queryRaw`SELECT 1 FROM "inventory" WHERE "productId" = ${id}::uuid FOR UPDATE`;
    }
    const invRows = await tx.inventory.findMany({
      where: { productId: { in: productIds } },
    });
    const invByProduct = new Map(invRows.map((r) => [r.productId, r]));
    for (const item of input.items) {
      const inv = invByProduct.get(item.productId);
      const available =
        (inv?.quantityOnHand ?? 0) - (inv?.quantityReserved ?? 0);
      if (item.quantity > available) {
        throw new ValidationError("Stock changed — please review and retry.");
      }
    }

    let customerId: string | null = null;
    if (phoneNormalized) {
      const existing = await tx.customer.findFirst({
        where: { phoneNormalized },
      });
      const customerRow = existing
        ? await tx.customer.update({
            where: { id: existing.id },
            data: {
              name: input.customer.name,
              email: input.customer.email || existing.email,
            },
          })
        : await tx.customer.create({
            data: {
              name: input.customer.name,
              phone: input.customer.phone!,
              phoneNormalized,
              email: input.customer.email || null,
            },
          });
      customerId = customerRow.id;
    }

    const allocated = await allocateBillNumber(tx, auth.user.code, fiscalYear);

    const created = await tx.bill.create({
      data: {
        billNumber: allocated.billNumber,
        userCode: auth.user.code,
        fiscalYear,
        sequenceNo: allocated.sequenceNo,
        type: "COUNTER",
        createdById: auth.user.id,
        customerId,
        sellerName: seller.name,
        sellerGstin: seller.gstin,
        sellerStateCode: seller.stateCode,
        sellerAddress: seller.address,
        buyerName: input.customer.name,
        buyerPhone: input.customer.phone || null,
        buyerGstin: input.customer.gstin || null,
        buyerAddress: input.customer.address || null,
        buyerStateCode: buyerStateCode,
        buyerStateName: stateNameForCode(buyerStateCode) ?? buyerStateCode,
        intraState,
        paymentMode: input.paymentMode,
        subtotalPaise: invoice.subtotalPaise,
        discountPaise: invoice.discountPaise,
        taxableValuePaise: invoice.taxableValuePaise,
        cgstPaise: invoice.cgstPaise,
        sgstPaise: invoice.sgstPaise,
        igstPaise: invoice.igstPaise,
        shippingPaise: 0,
        roundOffPaise: invoice.roundOffPaise,
        totalPaise: invoice.totalPaise,
        items: {
          create: invoice.lines.map((l: InvoiceLine, idx) => {
            const p = byId.get(input.items[idx]!.productId)!;
            return {
              productId: p.id,
              sku: p.sku,
              name: p.name,
              hsnCode: p.hsnCode,
              unitPricePaise: l.unitPricePaise,
              gstRateBp: l.gstRateBp,
              quantity: l.quantity,
              discountPaise: l.discountPaise,
              taxableValuePaise: l.taxableValuePaise,
              cgstPaise: l.cgstPaise,
              sgstPaise: l.sgstPaise,
              igstPaise: l.igstPaise,
              lineTotalPaise: l.lineTotalPaise,
            };
          }),
        },
      },
    });

    // Physical stock leaves the shop now.
    for (const item of input.items) {
      const inv = invByProduct.get(item.productId)!;
      const balanceAfter = inv.quantityOnHand - item.quantity;
      await tx.inventory.update({
        where: { productId: item.productId },
        data: { quantityOnHand: balanceAfter },
      });
      await tx.inventoryMovement.create({
        data: {
          productId: item.productId,
          changeQty: -item.quantity,
          balanceAfter,
          reason: "SALE",
          note: `Counter bill ${created.billNumber}`,
          refType: "bill",
          refId: created.id,
          createdById: auth.user.id,
        },
      });
    }

    await recordAudit(
      auditActor(auth),
      {
        action: "bill.issue",
        summary: `${auth.user.code} issued counter bill ${created.billNumber} — ${formatPaise(created.totalPaise)}`,
        entityType: "Bill",
        entityId: created.id,
        details: {
          billNumber: created.billNumber,
          paymentMode: input.paymentMode,
          totalPaise: created.totalPaise,
          items: input.items.map((i) => ({
            productId: i.productId,
            qty: i.quantity,
          })),
        },
      },
      ctx,
      tx,
    );
    return created;
  });

  // The PDF is a regenerable cache (getBillPdfBytes rebuilds it if missing), so
  // a failure here never fails bill issuance — but we await it so the stored
  // key is ready by the time the caller renders the detail page.
  await safeGeneratePdf(bill.id);
  return getBill({ id: bill.id });
}

// ---------------------------------------------------------------------------
// Cancel a bill (keeps the number)
// ---------------------------------------------------------------------------

export async function cancelBill(raw: unknown) {
  const auth = await requirePermission("billing.cancel");
  const input = cancelBillSchema.parse(raw);
  const ctx = await getRequestContext();

  const bill = await db.bill.findUnique({
    where: { id: input.id },
    include: { items: true },
  });
  if (!bill) throw new NotFoundError("That bill does not exist.");
  if (bill.status === "CANCELLED") {
    throw new ValidationError("That bill is already cancelled.");
  }

  await db.$transaction(async (tx) => {
    await tx.bill.update({
      where: { id: bill.id },
      data: {
        status: "CANCELLED",
        cancelledReason: input.reason,
        cancelledAt: new Date(),
        cancelledById: auth.user.id,
      },
    });

    // Counter sales put stock back; online-order bills do not touch stock here
    // (the order's own lifecycle handles that).
    if (bill.type === "COUNTER") {
      const lines = bill.items.filter((i) => i.productId);
      const ids = [...new Set(lines.map((i) => i.productId!))].sort();
      for (const id of ids) {
        await tx.$queryRaw`SELECT 1 FROM "inventory" WHERE "productId" = ${id}::uuid FOR UPDATE`;
      }
      for (const line of lines) {
        const inv = await tx.inventory.findUnique({
          where: { productId: line.productId! },
        });
        if (!inv) continue;
        const balanceAfter = inv.quantityOnHand + line.quantity;
        await tx.inventory.update({
          where: { productId: line.productId! },
          data: { quantityOnHand: balanceAfter },
        });
        await tx.inventoryMovement.create({
          data: {
            productId: line.productId!,
            changeQty: line.quantity,
            balanceAfter,
            reason: "RETURN",
            note: `Cancelled bill ${bill.billNumber}`,
            refType: "bill_cancel",
            refId: bill.id,
            createdById: auth.user.id,
          },
        });
      }
    }

    await recordAudit(
      auditActor(auth),
      {
        action: "bill.cancel",
        summary: `${auth.user.code} cancelled bill ${bill.billNumber}`,
        entityType: "Bill",
        entityId: bill.id,
        details: { billNumber: bill.billNumber, reason: input.reason },
      },
      ctx,
      tx,
    );
  });

  return getBill({ id: bill.id });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listBills(
  filter: {
    q?: string;
    code?: string;
    type?: string;
    status?: string;
    page?: number;
  } = {},
) {
  await requirePermission("billing.view");
  const page = Math.max(1, Math.floor(filter.page ?? 1));

  const where: Prisma.BillWhereInput = {};
  if (filter.q) {
    where.OR = [
      { billNumber: { contains: filter.q, mode: "insensitive" } },
      { buyerName: { contains: filter.q, mode: "insensitive" } },
      { buyerPhone: { contains: filter.q } },
    ];
  }
  if (filter.code) where.userCode = filter.code;
  if (filter.type === "ONLINE_ORDER" || filter.type === "COUNTER") {
    where.type = filter.type;
  }
  if (filter.status === "ISSUED" || filter.status === "CANCELLED") {
    where.status = filter.status;
  }

  const total = await db.bill.count({ where });
  const rows = await db.bill.findMany({
    where,
    orderBy: { billedAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: {
      _count: { select: { items: true } },
      createdBy: { select: { code: true } },
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

export async function getBill(raw: unknown) {
  await requirePermission("billing.view");
  const { id } = billIdSchema.parse(raw);
  const bill = await db.bill.findUnique({
    where: { id },
    include: {
      items: { orderBy: { name: "asc" } },
      createdBy: { select: { code: true, name: true } },
      cancelledBy: { select: { code: true } },
      order: { select: { reference: true } },
      customer: { select: { id: true } },
    },
  });
  if (!bill) throw new NotFoundError("That bill does not exist.");
  return bill;
}

/** PAID online orders that do not have a bill yet. */
export async function listBillableOrders() {
  await requirePermission("billing.view");
  return db.order.findMany({
    where: { paymentStatus: "PAID", bill: null },
    orderBy: { placedAt: "desc" },
    take: 100,
    include: { _count: { select: { items: true } } },
  });
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

/** Warm the bill-PDF cache; never throws (regenerated on demand otherwise). */
export async function safeGeneratePdf(billId: string): Promise<void> {
  // In tests, skip the eager warm — getBillPdfBytes regenerates on demand, and
  // rendering a PDF per bill would starve the in-process test database.
  if (isTest) return;
  try {
    await generateAndStoreBillPdf(billId, db);
  } catch (err) {
    // A failed PDF must not fail bill issuance — it is regenerated on demand.
    logger.error("bill.pdf_generate_failed", {
      billId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function generateAndStoreBillPdf(
  billId: string,
  client: AnyDb,
): Promise<string> {
  const bill = await client.bill.findUnique({
    where: { id: billId },
    include: { items: { orderBy: { name: "asc" } } },
  });
  if (!bill) throw new NotFoundError("Bill not found.");

  const bytes = await renderBillPdf(bill);
  const key = `${BILL_PDF_PREFIX}/${randomUUID()}.pdf`;
  await getStorage().put(key, bytes, "application/pdf");
  await client.bill.update({
    where: { id: billId },
    data: { pdfStorageKey: key },
  });
  return key;
}

export async function getBillPdfBytes(
  raw: unknown,
): Promise<{ data: Uint8Array; filename: string }> {
  await requirePermission("billing.view");
  const { id } = billIdSchema.parse(raw);
  const bill = await db.bill.findUnique({ where: { id } });
  if (!bill) throw new NotFoundError("That bill does not exist.");

  const storage = getStorage();
  if (bill.pdfStorageKey) {
    const obj = await storage.get(bill.pdfStorageKey);
    if (obj) {
      return { data: obj.data, filename: `${bill.billNumber}.pdf` };
    }
  }
  await generateAndStoreBillPdf(id, db);
  const refreshed = await db.bill.findUniqueOrThrow({ where: { id } });
  const obj = await storage.get(refreshed.pdfStorageKey!);
  if (!obj) throw new AppError("INTERNAL", "Could not produce the bill PDF.");
  return { data: obj.data, filename: `${bill.billNumber}.pdf` };
}
