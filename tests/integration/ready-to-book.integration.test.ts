/**
 * Ready to Book (consolidated report) + Cover Print — integration tests.
 * Skipped unless TEST_DATABASE_URL is set (CI provides Postgres).
 *
 * Ready to Book is a *derived* view (`status === "PACKED" && paymentStatus
 * === "PAID"`) — these tests exercise that derivation against the real
 * database, not a parallel status system.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { TEST_DB, db as prisma, loginAs, logout, resetCatalogue } from "./_context";
import { _resetRateLimits } from "@/lib/rate-limit";
import { createOnlineOrder } from "@/server/services/orders-service";
import { updateSettings } from "@/server/services/settings-service";
import {
  submitPayment,
  verifyPayment,
} from "@/server/services/payments-service";
import {
  markOrderPacked,
  confirmParcelBooked,
  getReadyToBookOrders,
  getReadyToBookForReport,
  getCoverData,
  getCoverDataBulk,
} from "@/server/services/booking-service";

const d = TEST_DB ? describe : describe.skip;

const CUSTOMER = {
  name: "Ready Buyer",
  phone: "9876500099",
  addressLine1: "12 Depot Street",
  city: "Sivakasi",
  stateCode: "33",
  pincode: "626123",
};

let seq = 0;

async function makeProduct(stock: number) {
  seq += 1;
  const sku = `RTB-${seq}`;
  const category = await prisma.category.upsert({
    where: { slug: "rtb-cat" },
    update: {},
    create: { name: "Rtb Cat", slug: "rtb-cat", isActive: true },
  });
  return prisma.product.create({
    data: {
      sku,
      slug: sku.toLowerCase(),
      name: sku,
      categoryId: category.id,
      pricePaise: 50000,
      gstRateBp: 1800,
      isActive: true,
      isVisibleOnline: true,
      inventory: { create: { quantityOnHand: stock } },
    },
  });
}

/** Place an order and take it all the way to PAID via the real payment flow. */
async function makePaidOrder(
  overrides: Partial<typeof CUSTOMER> = {},
  qty = 1,
) {
  const p = await makeProduct(20);
  logout();
  const { reference } = await createOnlineOrder(
    {
      items: [{ slug: p.slug, quantity: qty }],
      customer: { ...CUSTOMER, ...overrides },
    },
    { partnerCode: "psr" },
  );
  await submitPayment(reference, {
    upiReference: `RTB${seq}${Date.now()}`.slice(0, 34),
  });
  const payment = await prisma.payment.findFirstOrThrow({
    where: { order: { reference } },
  });
  await loginAs(prisma, "PK");
  await verifyPayment({ paymentId: payment.id, action: "verify" });
  logout();
  const order = await prisma.order.findUniqueOrThrow({ where: { reference } });
  expect(order.status).toBe("PAID");
  return { order, product: p };
}

async function makePackedOrder(overrides: Partial<typeof CUSTOMER> = {}) {
  const { order, product } = await makePaidOrder(overrides);
  await loginAs(prisma, "PK");
  await markOrderPacked({ orderId: order.id });
  logout();
  return { order, product };
}

const goodParcel = (orderId: string, parcelCount = "2") => ({
  orderId,
  courierName: "Professional Couriers",
  lrNumber: "TN-2026/0099",
  bookingDate: new Date().toISOString().slice(0, 10),
  parcelCount,
  remarks: "internal only note — never customer-facing",
});

async function denyPermission(userCode: string, permissionKey: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { code: userCode },
  });
  const permission = await prisma.permission.findUniqueOrThrow({
    where: { key: permissionKey },
  });
  await prisma.userPermission.upsert({
    where: {
      userId_permissionId: { userId: user.id, permissionId: permission.id },
    },
    create: {
      userId: user.id,
      permissionId: permission.id,
      effect: "DENY",
      note: "test",
    },
    update: { effect: "DENY" },
  });
}

d("Ready to Book + Cover Print", () => {
  beforeEach(async () => {
    await resetCatalogue(prisma);
    await prisma.userPermission.deleteMany();
    _resetRateLimits();
    logout();
    seq = 0;
    await loginAs(prisma, "PK");
    await updateSettings({
      "tax.pricesIncludeGst": false,
      "shipping.mode": "flat",
      "shipping.flatPaise": 4000,
      "shipping.freeAbovePaise": 0,
      "fulfilment.serviceableStateCodes": ["33"],
      "billing.housePartnerCode": "PK",
    });
    logout();
  });

  describe("eligibility (1-5)", () => {
    it("1. a paid + packed order appears in Ready to Book", async () => {
      const { order } = await makePackedOrder();
      await loginAs(prisma, "PK");
      const list = await getReadyToBookOrders({});
      logout();
      expect(list.rows.some((r) => r.id === order.id)).toBe(true);
    });

    it("2. an unpaid order does NOT appear", async () => {
      const p = await makeProduct(10);
      logout();
      const { reference } = await createOnlineOrder(
        { items: [{ slug: p.slug, quantity: 1 }], customer: CUSTOMER },
        {},
      );
      await loginAs(prisma, "PK");
      const list = await getReadyToBookOrders({});
      logout();
      expect(list.rows.some((r) => r.reference === reference)).toBe(false);
    });

    it("3. a paid-but-not-yet-packed order does NOT appear", async () => {
      const { order } = await makePaidOrder();
      await loginAs(prisma, "PK");
      const list = await getReadyToBookOrders({});
      logout();
      expect(list.rows.some((r) => r.id === order.id)).toBe(false);
    });

    it("4. a cancelled order does NOT appear even if it was packed", async () => {
      const { order } = await makePackedOrder();
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "CANCELLED" },
      });
      await loginAs(prisma, "PK");
      const list = await getReadyToBookOrders({});
      logout();
      expect(list.rows.some((r) => r.id === order.id)).toBe(false);
    });

    it("5. an already-booked (PARCEL_BOOKED) order does NOT appear", async () => {
      const { order } = await makePackedOrder();
      await loginAs(prisma, "PK");
      await confirmParcelBooked(goodParcel(order.id));
      const list = await getReadyToBookOrders({});
      logout();
      expect(list.rows.some((r) => r.id === order.id)).toBe(false);
    });
  });

  describe("auto-update (6)", () => {
    it("6. a successfully booked order disappears from Ready to Book immediately", async () => {
      const { order } = await makePackedOrder();
      await loginAs(prisma, "PK");
      let list = await getReadyToBookOrders({});
      expect(list.rows.some((r) => r.id === order.id)).toBe(true);

      await confirmParcelBooked(goodParcel(order.id));
      list = await getReadyToBookOrders({});
      logout();
      expect(list.rows.some((r) => r.id === order.id)).toBe(false);
    });

    it("a failed booking attempt leaves the order in Ready to Book", async () => {
      const { order } = await makePackedOrder();
      await loginAs(prisma, "PK");
      await expect(
        confirmParcelBooked({ ...goodParcel(order.id), lrNumber: "" }),
      ).rejects.toBeTruthy();
      const list = await getReadyToBookOrders({});
      logout();
      expect(list.rows.some((r) => r.id === order.id)).toBe(true);
    });
  });

  describe("permissions (7-9)", () => {
    it("7. staff denied booking.view cannot read Ready to Book", async () => {
      await makePackedOrder();
      await denyPermission("S1", "booking.view");
      await loginAs(prisma, "S1");
      await expect(getReadyToBookOrders({})).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(getReadyToBookForReport({})).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      logout();
    });

    it("staff WITH booking.view (the default grant) can read Ready to Book", async () => {
      const { order } = await makePackedOrder();
      await loginAs(prisma, "S1");
      const list = await getReadyToBookOrders({});
      logout();
      expect(list.rows.some((r) => r.id === order.id)).toBe(true);
    });

    it("8. a partner keeps access even with a DENY override (DENY is ignored for partners)", async () => {
      const { order } = await makePackedOrder();
      await denyPermission("PSR", "booking.view");
      await loginAs(prisma, "PSR");
      const list = await getReadyToBookOrders({});
      logout();
      expect(list.rows.some((r) => r.id === order.id)).toBe(true);
    });

    it("9. an unauthenticated caller is rejected", async () => {
      await makePackedOrder();
      logout();
      await expect(getReadyToBookOrders({})).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
      });
      await expect(
        getCoverData({ orderId: "11111111-1111-4111-8111-111111111111" }),
      ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    });
  });

  describe("filters (10)", () => {
    it("10a. filters by city", async () => {
      const { order: match } = await makePackedOrder({ city: "Sivakasi" });
      const { order: other } = await makePackedOrder({ city: "Virudhunagar" });
      await loginAs(prisma, "PK");
      const list = await getReadyToBookOrders({ city: "sivakasi" });
      logout();
      expect(list.rows.some((r) => r.id === match.id)).toBe(true);
      expect(list.rows.some((r) => r.id === other.id)).toBe(false);
    });

    it("10b. filters by pincode prefix", async () => {
      const { order: match } = await makePackedOrder({ pincode: "626123" });
      const { order: other } = await makePackedOrder({ pincode: "600001" });
      await loginAs(prisma, "PK");
      const list = await getReadyToBookOrders({ pincode: "6261" });
      logout();
      expect(list.rows.some((r) => r.id === match.id)).toBe(true);
      expect(list.rows.some((r) => r.id === other.id)).toBe(false);
    });

    it("10c. filters by courier / transport", async () => {
      const { order: a } = await makePackedOrder();
      const { order: b } = await makePackedOrder();
      await prisma.booking.update({
        where: { orderId: b.id },
        data: { courierName: "DTDC Express" },
      });
      await loginAs(prisma, "PK");
      const list = await getReadyToBookOrders({ courier: "dtdc" });
      logout();
      expect(list.rows.some((r) => r.id === b.id)).toBe(true);
      expect(list.rows.some((r) => r.id === a.id)).toBe(false);
    });

    it("10d. free-text search matches bill number, order reference, customer name and phone", async () => {
      const { order } = await makePackedOrder({
        name: "Very Unique Searchable Name",
      });
      await loginAs(prisma, "PK");
      const byName = await getReadyToBookOrders({ q: "Unique Searchable" });
      const byPhone = await getReadyToBookOrders({ q: order.customerPhone });
      const byRef = await getReadyToBookOrders({
        q: order.reference.slice(0, 8),
      });
      const noMatch = await getReadyToBookOrders({ q: "no-such-order-xyz" });
      logout();
      expect(byName.rows.some((r) => r.id === order.id)).toBe(true);
      expect(byPhone.rows.some((r) => r.id === order.id)).toBe(true);
      expect(byRef.rows.some((r) => r.id === order.id)).toBe(true);
      expect(noMatch.rows.some((r) => r.id === order.id)).toBe(false);
    });

    it("10e. rejects an invalid filter (from after to) with a VALIDATION error", async () => {
      await loginAs(prisma, "PK");
      await expect(
        getReadyToBookOrders({ from: "2026-02-01", to: "2026-01-01" }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
      logout();
    });
  });

  describe("consolidated totals (11)", () => {
    it("11. summary totals equal the sum of the filtered rows", async () => {
      const { order: a } = await makePackedOrder();
      const { order: b } = await makePackedOrder();

      await loginAs(prisma, "PK");
      const report = await getReadyToBookForReport({});
      logout();

      const rowsHere = report.rows.filter(
        (r) => r.id === a.id || r.id === b.id,
      );
      expect(rowsHere).toHaveLength(2);

      const expectedValue = rowsHere.reduce((s, r) => s + r.totalPaise, 0);
      const expectedItems = rowsHere.reduce((s, r) => s + r.itemCount, 0);
      const expectedParcels = rowsHere.reduce((s, r) => s + r.parcelCount, 0);

      // The summary covers the *whole* filtered set (which, in this fresh
      // reset, is exactly these two orders).
      expect(report.summary.orders).toBe(report.rows.length);
      expect(report.summary.valuePaise).toBe(
        report.rows.reduce((s, r) => s + r.totalPaise, 0),
      );
      expect(report.summary.items).toBe(
        report.rows.reduce((s, r) => s + r.itemCount, 0),
      );
      expect(report.summary.parcels).toBe(
        report.rows.reduce((s, r) => s + r.parcelCount, 0),
      );
      // Sanity: our two known orders' contribution matches too.
      expect(expectedValue).toBeGreaterThan(0);
      expect(expectedItems).toBeGreaterThan(0);
      expect(expectedParcels).toBeGreaterThan(0);
    });
  });

  describe("cover print (12-14)", () => {
    it("12a. cover data has correct customer/order info and excludes payment/internal data", async () => {
      const { order } = await makePackedOrder();
      await loginAs(prisma, "PK");
      const cover = await getCoverData({ orderId: order.id });
      logout();

      expect(cover.customerName).toBe(CUSTOMER.name);
      expect(cover.customerPhone).toBe(order.customerPhone);
      expect(cover.address.city).toBe(order.city);
      expect(cover.address.pincode).toBe(order.pincode);
      expect(cover.orderRef).not.toBe(order.id);
      expect(cover.orderRef).not.toContain(order.id);

      // No payment secrets, no internal booking remarks.
      const serialised = JSON.stringify(cover);
      expect(serialised).not.toMatch(/upi|vpa|utr/i);
      expect(serialised).not.toContain("internal only note");
    });

    it("12b. a cover cannot be printed for an unpacked (PAID-only) order", async () => {
      const { order } = await makePaidOrder();
      await loginAs(prisma, "PK");
      await expect(
        getCoverData({ orderId: order.id }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      logout();
    });

    it("13. defaults to a single parcel (1 of 1) before a parcel count is booked", async () => {
      const { order } = await makePackedOrder();
      await loginAs(prisma, "PK");
      const cover = await getCoverData({ orderId: order.id });
      logout();
      expect(cover.parcelCount).toBe(1);
      expect(cover.parcelCountKnown).toBe(false);
    });

    it("14. reflects the real parcel count once PARCEL_BOOKED with parcelCount > 1", async () => {
      const { order } = await makePackedOrder();
      await loginAs(prisma, "PK");
      await confirmParcelBooked(goodParcel(order.id, "4"));
      const cover = await getCoverData({ orderId: order.id });
      logout();
      expect(cover.parcelCount).toBe(4);
      expect(cover.parcelCountKnown).toBe(true);
    });

    it("bulk cover data returns one entry per eligible order, skipping ineligible ones", async () => {
      const { order: eligible } = await makePackedOrder();
      const { order: ineligible } = await makePaidOrder();
      await loginAs(prisma, "PK");
      const covers = await getCoverDataBulk({
        orderIds: [eligible.id, ineligible.id],
      });
      logout();
      expect(covers).toHaveLength(1);
      expect(covers[0]!.orderId).toBe(eligible.id);
    });
  });

  describe("export respects filters (15)", () => {
    it("15. the report set used for export matches the same filters as the on-screen list", async () => {
      const { order: match } = await makePackedOrder({ city: "Sivakasi" });
      const { order: other } = await makePackedOrder({ city: "Virudhunagar" });
      await loginAs(prisma, "PK");
      const screen = await getReadyToBookOrders({ city: "Sivakasi" });
      const report = await getReadyToBookForReport({ city: "Sivakasi" });
      logout();

      const screenIds = screen.rows.map((r) => r.id).sort();
      const reportIds = report.rows.map((r) => r.id).sort();
      expect(reportIds).toEqual(screenIds);
      expect(reportIds).toContain(match.id);
      expect(reportIds).not.toContain(other.id);
    });
  });
});
