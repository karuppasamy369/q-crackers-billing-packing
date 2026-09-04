/**
 * Phase 9 integration tests — partner-only reports.
 * Skipped unless TEST_DATABASE_URL is set (CI provides Postgres).
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  TEST_DB,
  db as prisma,
  loginAs,
  logout,
  resetCatalogue,
} from "./_context";
import { _resetRateLimits } from "@/lib/rate-limit";
import { createOnlineOrder } from "@/server/services/orders-service";
import { updateSettings } from "@/server/services/settings-service";
import {
  submitPayment,
  verifyPayment,
} from "@/server/services/payments-service";
import {
  createCounterBill,
  cancelBill,
} from "@/server/services/billing-service";
import {
  salesByDay,
  salesTotals,
  billingByUserCode,
  productSales,
  gstSummary,
  paymentSummary,
  orderStatusSummary,
  bookingSummary,
  cancellationsReport,
  stockSalesSummary,
  getReportsBundle,
} from "@/server/services/reports-service";

const d = TEST_DB ? describe : describe.skip;

const CUSTOMER = {
  name: "Report Buyer",
  phone: "9876000123",
  addressLine1: "1 Ledger Road",
  city: "Sivakasi",
  stateCode: "33",
  pincode: "626123",
};

const RANGE = () => {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  return { from, to };
};

let seq = 0;

async function makeProduct(pricePaise = 50000) {
  seq += 1;
  const sku = `RPT-${seq}`;
  const category = await prisma.category.upsert({
    where: { slug: "rpt-cat" },
    update: {},
    create: { name: "Rpt Cat", slug: "rpt-cat", isActive: true },
  });
  return prisma.product.create({
    data: {
      sku,
      slug: sku.toLowerCase(),
      name: sku,
      categoryId: category.id,
      pricePaise,
      gstRateBp: 1800,
      isActive: true,
      isVisibleOnline: true,
      inventory: { create: { quantityOnHand: 100 } },
    },
  });
}

async function makePaidOnlineOrder(qty = 1) {
  logout();
  const p = await makeProduct();
  const { reference } = await createOnlineOrder(
    { items: [{ slug: p.slug, quantity: qty }], customer: CUSTOMER },
    { partnerCode: "psr" },
  );
  const order = await prisma.order.findUniqueOrThrow({ where: { reference } });
  await submitPayment(reference, {
    upiReference: `RPT${seq}${Date.now()}`.toUpperCase().slice(0, 30),
  });
  const payment = await prisma.payment.findFirstOrThrow({
    where: { orderId: order.id },
  });
  await loginAs(prisma, "PK");
  await verifyPayment({ paymentId: payment.id, action: "verify" });
  logout();
  return { order, product: p };
}

d("Phase 9 — reports", () => {
  beforeEach(async () => {
    await resetCatalogue(prisma);
    await prisma.userPermission.deleteMany();
    _resetRateLimits();
    logout();
    seq = 0;
    await loginAs(prisma, "PK");
    await updateSettings({
      "tax.pricesIncludeGst": false,
      "business.stateCode": "33",
      "business.legalName": "Q Crackers Test",
      "shipping.mode": "flat",
      "shipping.flatPaise": 4000,
      "shipping.freeAbovePaise": 0,
      "fulfilment.serviceableStateCodes": ["33"],
      "billing.housePartnerCode": "PK",
    });
    logout();
  });

  it("requires reports.view — staff are refused", async () => {
    await loginAs(prisma, "S1");
    for (const fn of [
      () => salesTotals({}),
      () => salesByDay({}),
      () => billingByUserCode({}),
      () => productSales({}),
      () => gstSummary({}),
      () => paymentSummary({}),
      () => orderStatusSummary({}),
      () => bookingSummary({}),
      () => cancellationsReport({}),
      () => stockSalesSummary({}),
      () => getReportsBundle({}),
    ]) {
      await expect(fn()).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    logout();
  });

  it("validates the date range", async () => {
    await loginAs(prisma, "PK");
    await expect(
      salesTotals({ from: "2026-02-01", to: "2026-01-01" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(salesTotals({ from: "not-a-date" })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    logout();
  });

  it("aggregates online + counter sales for a partner", async () => {
    await makePaidOnlineOrder(2);
    await makePaidOnlineOrder(1);

    const p = await makeProduct(30000);
    await loginAs(prisma, "PK");
    await createCounterBill({
      customer: { name: "Walk-in", stateCode: "33" },
      items: [{ productId: p.id, quantity: 3 }],
      paymentMode: "CASH",
    });

    const range = RANGE();
    const totals = await salesTotals(range);
    expect(totals.bills).toBe(3);
    expect(totals.totalPaise).toBeGreaterThan(0);
    expect(totals.cgstPaise + totals.sgstPaise).toBeGreaterThan(0); // intra-state

    const daily = await salesByDay(range);
    expect(daily.days.reduce((s, x) => s + x.bills, 0)).toBe(3);

    const byCode = await billingByUserCode(range);
    const codes = new Set(byCode.rows.map((r) => r.userCode));
    expect(codes.has("PK")).toBe(true); // counter bill under PK
    expect(codes.has("PSR")).toBe(true); // online orders assigned to PSR

    const products = await productSales(range);
    expect(products.rows.length).toBeGreaterThanOrEqual(3);
    expect(products.rows[0]!.revenuePaise).toBeGreaterThanOrEqual(
      products.rows[products.rows.length - 1]!.revenuePaise,
    );

    const gst = await gstSummary(range);
    expect(gst.intraState.cgstPaise).toBeGreaterThan(0);
    expect(gst.interState.igstPaise).toBe(0);

    const pay = await paymentSummary(range);
    expect(pay.online.some((r) => r.status === "VERIFIED")).toBe(true);
    expect(pay.counter.some((r) => r.mode === "CASH")).toBe(true);

    const status = await orderStatusSummary(range);
    expect(status.rows.some((r) => r.status === "PAID")).toBe(true);

    logout();
  });

  it("counts bookings and cancellations", async () => {
    const { order } = await makePaidOnlineOrder(1);
    const { order: order2 } = await makePaidOnlineOrder(1);

    await loginAs(prisma, "PK");
    const bill2 = await prisma.bill.findFirstOrThrow({
      where: { orderId: order2.id },
    });
    await cancelBill({ id: bill2.id, reason: "customer cancelled" });
    // Reflect the cancellation on the order too.
    await prisma.orderStatusHistory.create({
      data: {
        orderId: order2.id,
        fromStatus: "PAID",
        toStatus: "CANCELLED",
        reason: "customer cancelled",
      },
    });
    await prisma.order.update({
      where: { id: order2.id },
      data: { status: "CANCELLED" },
    });

    // Book the other one.
    const { markOrderPacked, confirmParcelBooked } = await import(
      "@/server/services/booking-service"
    );
    await markOrderPacked({ orderId: order.id });
    await confirmParcelBooked({
      orderId: order.id,
      courierName: "DTDC",
      lrNumber: "LR-1",
      bookingDate: new Date().toISOString().slice(0, 10),
      parcelCount: "1",
      remarks: "",
    });

    const range = RANGE();
    const booking = await bookingSummary(range);
    expect(booking.packed).toBeGreaterThanOrEqual(1);
    expect(booking.parcelBooked).toBeGreaterThanOrEqual(1);

    const cancels = await cancellationsReport(range);
    expect(cancels.cancelledBills).toBeGreaterThanOrEqual(1);
    expect(cancels.cancelledOrders).toBeGreaterThanOrEqual(1);
    expect(cancels.bills[0]?.reason).toBe("customer cancelled");

    const stock = await stockSalesSummary(range);
    expect(stock.rows.some((r) => r.unitsSold > 0)).toBe(true);

    const bundle = await getReportsBundle(range);
    expect(bundle.totals.bills).toBeGreaterThanOrEqual(1);
    expect(bundle.range.from).toBe(range.from);
    logout();
  });
});
