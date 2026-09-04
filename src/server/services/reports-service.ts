import "server-only";

import { db } from "@/server/db";
import { Prisma } from "@/generated/prisma";
import { requirePermission } from "@/server/rbac/authorize";
import { ValidationError } from "@/server/http/errors";
import { reportRangeSchema, toDateWindow } from "@/lib/validation/reports";

/**
 * Partner-only reporting. Every entry point re-checks `reports.view`
 * server-side and validates the date range; nothing here mutates data.
 * Amounts are integer paise — the UI formats them.
 */
async function windowFrom(raw: unknown) {
  await requirePermission("reports.view");
  const parsed = reportRangeSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Invalid date range.",
    );
  }
  return { range: parsed.data, window: toDateWindow(parsed.data) };
}

const n = (v: bigint | number | null | undefined): number => Number(v ?? 0);

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------

export async function salesByDay(raw: unknown) {
  const { range, window } = await windowFrom(raw);
  const rows = await db.$queryRaw<
    { day: Date; bills: bigint; total: bigint | null; gst: bigint | null }[]
  >(Prisma.sql`
    SELECT date_trunc('day', "billedAt")::date AS day,
           count(*)                            AS bills,
           coalesce(sum("totalPaise"), 0)      AS total,
           coalesce(sum("cgstPaise" + "sgstPaise" + "igstPaise"), 0) AS gst
      FROM "bills"
     WHERE "status" = 'ISSUED'
       AND "billedAt" >= ${window.gte}
       AND "billedAt" <  ${window.lt}
     GROUP BY 1
     ORDER BY 1 ASC
  `);
  return {
    range,
    days: rows.map((r) => ({
      day: r.day.toISOString().slice(0, 10),
      bills: n(r.bills),
      totalPaise: n(r.total),
      gstPaise: n(r.gst),
    })),
  };
}

export async function salesTotals(raw: unknown) {
  const { range, window } = await windowFrom(raw);
  const [agg, intraSplit] = await Promise.all([
    db.bill.aggregate({
      where: { status: "ISSUED", billedAt: window },
      _count: true,
      _sum: {
        subtotalPaise: true,
        discountPaise: true,
        taxableValuePaise: true,
        cgstPaise: true,
        sgstPaise: true,
        igstPaise: true,
        shippingPaise: true,
        roundOffPaise: true,
        totalPaise: true,
      },
    }),
    db.bill.groupBy({
      by: ["type"],
      where: { status: "ISSUED", billedAt: window },
      _count: true,
      _sum: { totalPaise: true },
    }),
  ]);
  return {
    range,
    bills: agg._count,
    subtotalPaise: n(agg._sum.subtotalPaise),
    discountPaise: n(agg._sum.discountPaise),
    taxableValuePaise: n(agg._sum.taxableValuePaise),
    cgstPaise: n(agg._sum.cgstPaise),
    sgstPaise: n(agg._sum.sgstPaise),
    igstPaise: n(agg._sum.igstPaise),
    shippingPaise: n(agg._sum.shippingPaise),
    roundOffPaise: n(agg._sum.roundOffPaise),
    totalPaise: n(agg._sum.totalPaise),
    byType: intraSplit.map((r) => ({
      type: r.type,
      bills: r._count,
      totalPaise: n(r._sum.totalPaise),
    })),
  };
}

export async function billingByUserCode(raw: unknown) {
  const { range, window } = await windowFrom(raw);
  const grouped = await db.bill.groupBy({
    by: ["userCode", "type"],
    where: { status: "ISSUED", billedAt: window },
    _count: true,
    _sum: { totalPaise: true },
    orderBy: { userCode: "asc" },
  });
  return {
    range,
    rows: grouped.map((r) => ({
      userCode: r.userCode,
      type: r.type,
      bills: r._count,
      totalPaise: n(r._sum.totalPaise),
    })),
  };
}

export async function productSales(raw: unknown) {
  const { range, window } = await windowFrom(raw);
  const grouped = await db.billItem.groupBy({
    by: ["sku", "name"],
    where: { bill: { is: { status: "ISSUED", billedAt: window } } },
    _sum: { quantity: true, lineTotalPaise: true, taxableValuePaise: true },
    orderBy: { _sum: { lineTotalPaise: "desc" } },
    take: 100,
  });
  return {
    range,
    rows: grouped.map((r) => ({
      sku: r.sku,
      name: r.name,
      quantity: n(r._sum.quantity),
      revenuePaise: n(r._sum.lineTotalPaise),
      taxableValuePaise: n(r._sum.taxableValuePaise),
    })),
  };
}

// ---------------------------------------------------------------------------
// GST
// ---------------------------------------------------------------------------

export async function gstSummary(raw: unknown) {
  const { range, window } = await windowFrom(raw);
  const grouped = await db.bill.groupBy({
    by: ["intraState"],
    where: { status: "ISSUED", billedAt: window },
    _count: true,
    _sum: {
      taxableValuePaise: true,
      cgstPaise: true,
      sgstPaise: true,
      igstPaise: true,
    },
  });
  const totals = grouped.reduce(
    (acc, r) => {
      acc.taxableValuePaise += n(r._sum.taxableValuePaise);
      acc.cgstPaise += n(r._sum.cgstPaise);
      acc.sgstPaise += n(r._sum.sgstPaise);
      acc.igstPaise += n(r._sum.igstPaise);
      acc.bills += r._count;
      return acc;
    },
    {
      taxableValuePaise: 0,
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 0,
      bills: 0,
    },
  );
  return {
    range,
    intraState: grouped.find((r) => r.intraState)
      ? {
          bills: grouped.find((r) => r.intraState)!._count,
          taxableValuePaise: n(
            grouped.find((r) => r.intraState)!._sum.taxableValuePaise,
          ),
          cgstPaise: n(grouped.find((r) => r.intraState)!._sum.cgstPaise),
          sgstPaise: n(grouped.find((r) => r.intraState)!._sum.sgstPaise),
        }
      : { bills: 0, taxableValuePaise: 0, cgstPaise: 0, sgstPaise: 0 },
    interState: grouped.find((r) => !r.intraState)
      ? {
          bills: grouped.find((r) => !r.intraState)!._count,
          taxableValuePaise: n(
            grouped.find((r) => !r.intraState)!._sum.taxableValuePaise,
          ),
          igstPaise: n(grouped.find((r) => !r.intraState)!._sum.igstPaise),
        }
      : { bills: 0, taxableValuePaise: 0, igstPaise: 0 },
    totals,
  };
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export async function paymentSummary(raw: unknown) {
  const { range, window } = await windowFrom(raw);
  const [online, counter] = await Promise.all([
    db.payment.groupBy({
      by: ["status"],
      where: { createdAt: window },
      _count: true,
      _sum: { amountPaise: true },
    }),
    db.bill.groupBy({
      by: ["paymentMode"],
      where: { type: "COUNTER", status: "ISSUED", billedAt: window },
      _count: true,
      _sum: { totalPaise: true },
    }),
  ]);
  return {
    range,
    online: online.map((r) => ({
      status: r.status,
      count: r._count,
      amountPaise: n(r._sum.amountPaise),
    })),
    counter: counter.map((r) => ({
      mode: r.paymentMode ?? "UNSPECIFIED",
      count: r._count,
      amountPaise: n(r._sum.totalPaise),
    })),
  };
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

export async function orderStatusSummary(raw: unknown) {
  const { range, window } = await windowFrom(raw);
  const grouped = await db.order.groupBy({
    by: ["status"],
    where: { placedAt: window },
    _count: true,
    _sum: { totalPaise: true },
  });
  return {
    range,
    rows: grouped.map((r) => ({
      status: r.status,
      count: r._count,
      totalPaise: n(r._sum.totalPaise),
    })),
  };
}

export async function bookingSummary(raw: unknown) {
  const { range, window } = await windowFrom(raw);
  const [packed, booked, completed, lrUploaded, awaitingPack] =
    await Promise.all([
      db.booking.count({ where: { packedAt: window } }),
      db.booking.count({ where: { parcelBookedAt: window } }),
      db.orderStatusHistory.count({
        where: { toStatus: "COMPLETED", createdAt: window },
      }),
      db.lrDocument.count({ where: { isCurrent: true, uploadedAt: window } }),
      db.order.count({ where: { status: "PAID" } }),
    ]);
  return {
    range,
    packed,
    parcelBooked: booked,
    completed,
    lrUploaded,
    awaitingPackNow: awaitingPack,
  };
}

export async function cancellationsReport(raw: unknown) {
  const { range, window } = await windowFrom(raw);
  const [cancelledOrders, cancelledBills, recentBills] = await Promise.all([
    db.orderStatusHistory.count({
      where: { toStatus: "CANCELLED", createdAt: window },
    }),
    db.bill.count({ where: { status: "CANCELLED", cancelledAt: window } }),
    db.bill.findMany({
      where: { status: "CANCELLED", cancelledAt: window },
      orderBy: { cancelledAt: "desc" },
      take: 50,
      select: {
        billNumber: true,
        totalPaise: true,
        cancelledAt: true,
        cancelledReason: true,
        cancelledBy: { select: { code: true } },
      },
    }),
  ]);
  return {
    range,
    cancelledOrders,
    cancelledBills,
    bills: recentBills.map((b) => ({
      billNumber: b.billNumber,
      totalPaise: b.totalPaise,
      cancelledAt: b.cancelledAt,
      reason: b.cancelledReason,
      byCode: b.cancelledBy?.code ?? null,
    })),
  };
}

export async function stockSalesSummary(raw: unknown) {
  const { range, window } = await windowFrom(raw);
  const sales = await db.inventoryMovement.groupBy({
    by: ["productId"],
    where: { reason: "SALE", createdAt: window },
    _sum: { changeQty: true },
    orderBy: { _sum: { changeQty: "asc" } }, // most negative = best-selling
    take: 50,
  });
  const productIds = sales.map((s) => s.productId);
  const products = await db.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      sku: true,
      name: true,
      inventory: {
        select: { quantityOnHand: true, quantityReserved: true },
      },
    },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  return {
    range,
    rows: sales.map((s) => {
      const p = byId.get(s.productId);
      return {
        sku: p?.sku ?? "—",
        name: p?.name ?? "(deleted product)",
        unitsSold: Math.abs(n(s._sum.changeQty)),
        onHand: p?.inventory?.quantityOnHand ?? 0,
        reserved: p?.inventory?.quantityReserved ?? 0,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Bundle for the reports page
// ---------------------------------------------------------------------------

export async function getReportsBundle(raw: unknown) {
  const [
    daily,
    totals,
    byCode,
    products,
    gst,
    payments,
    orderStatus,
    booking,
    cancellations,
    stock,
  ] = await Promise.all([
    salesByDay(raw),
    salesTotals(raw),
    billingByUserCode(raw),
    productSales(raw),
    gstSummary(raw),
    paymentSummary(raw),
    orderStatusSummary(raw),
    bookingSummary(raw),
    cancellationsReport(raw),
    stockSalesSummary(raw),
  ]);
  return {
    range: totals.range,
    daily,
    totals,
    byCode,
    products,
    gst,
    payments,
    orderStatus,
    booking,
    cancellations,
    stock,
  };
}
