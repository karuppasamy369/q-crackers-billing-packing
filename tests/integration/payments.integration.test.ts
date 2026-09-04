/**
 * Phase 5 integration tests — partner attribution + UPI payment + manual
 * verification. Skipped unless TEST_DATABASE_URL is set (CI provides Postgres).
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
  listPayments,
  releaseExpiredHolds,
  getPaymentScreenshotBytes,
} from "@/server/services/payments-service";
import {
  getMyPaymentAccount,
  updateMyPaymentAccount,
} from "@/server/services/payment-accounts-service";

const d = TEST_DB ? describe : describe.skip;

const CUSTOMER = {
  name: "Test Buyer",
  phone: "9876543210",
  addressLine1: "1 Test Street",
  city: "Sivakasi",
  stateCode: "33",
  pincode: "626123",
};

let productSeq = 0;

async function makeProduct(stock: number, pricePaise = 20000) {
  productSeq += 1;
  const sku = `PAY-${productSeq}`;
  const category = await prisma.category.upsert({
    where: { slug: "pay-cat" },
    update: {},
    create: { name: "Pay Cat", slug: "pay-cat", isActive: true },
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
      inventory: { create: { quantityOnHand: stock } },
    },
  });
}

async function placeOrder(
  slug: string,
  qty: number,
  partnerCode?: string,
) {
  logout();
  const { reference } = await createOnlineOrder(
    { items: [{ slug, quantity: qty }], customer: CUSTOMER },
    { partnerCode: partnerCode ?? null },
  );
  return prisma.order.findUniqueOrThrow({
    where: { reference },
    include: { items: true },
  });
}

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0,
]);
const NOT_AN_IMAGE = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"

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

d("Phase 5 — payments", () => {
  beforeEach(async () => {
    await resetCatalogue(prisma);
    await prisma.userPermission.deleteMany();
    _resetRateLimits();
    logout();
    productSeq = 0;
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

  describe("partner attribution", () => {
    it("assigns a /s/<code> link order permanently to that partner", async () => {
      const p = await makeProduct(10);
      const order = await placeOrder(p.slug, 1, "psr");
      expect(order.assignedPartnerCode).toBe("PSR");
      expect(order.assignedPartnerId).not.toBeNull();
    });

    it("assigns a direct order to the configured house partner", async () => {
      const p = await makeProduct(10);
      const order = await placeOrder(p.slug, 1);
      expect(order.assignedPartnerCode).toBe("PK");
    });

    it("ignores an unknown / inactive link code (falls back to house)", async () => {
      const p = await makeProduct(10);
      const order = await placeOrder(p.slug, 1, "ZZ");
      expect(order.assignedPartnerCode).toBe("PK");
    });

    it("blocks re-assigning assignedPartnerId once set (DB trigger)", async () => {
      const p = await makeProduct(10);
      const order = await placeOrder(p.slug, 1, "psr");
      const ka = await prisma.user.findUniqueOrThrow({ where: { code: "KA" } });
      await expect(
        prisma.order.update({
          where: { id: order.id },
          data: { assignedPartnerId: ka.id },
        }),
      ).rejects.toThrow();
    });
  });

  describe("submitPayment", () => {
    it("records a SUBMITTED payment and does NOT mark the order paid", async () => {
      const p = await makeProduct(10);
      const order = await placeOrder(p.slug, 1, "psr");

      const res = await submitPayment(order.reference, {
        upiReference: "123456789012",
      });
      expect(res.status).toBe("submitted");

      const payment = await prisma.payment.findFirstOrThrow({
        where: { orderId: order.id },
      });
      expect(payment.status).toBe("SUBMITTED");
      expect(payment.amountPaise).toBe(order.totalPaise);

      const fresh = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
      });
      expect(fresh.paymentStatus).toBe("PENDING");
      expect(fresh.status).toBe("AWAITING_PAYMENT");

      const audit = await prisma.auditLog.findFirst({
        where: { action: "payment.submit", entityId: payment.id },
      });
      expect(audit).not.toBeNull();
    });

    it("rejects a UTR already used by another payment", async () => {
      const p = await makeProduct(10);
      const o1 = await placeOrder(p.slug, 1, "psr");
      const o2 = await placeOrder(p.slug, 1, "psr");
      await submitPayment(o1.reference, { upiReference: "555555555555" });
      await expect(
        submitPayment(o2.reference, { upiReference: "555555555555" }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
    });

    it("updates the still-open submission when the customer re-enters a UTR", async () => {
      const p = await makeProduct(10);
      const order = await placeOrder(p.slug, 1, "psr");
      await submitPayment(order.reference, { upiReference: "111111111111" });
      const res = await submitPayment(order.reference, {
        upiReference: "222222222222",
      });
      expect(res.status).toBe("already_submitted");
      const payments = await prisma.payment.findMany({
        where: { orderId: order.id },
      });
      expect(payments).toHaveLength(1);
      expect(payments[0]!.upiReference).toBe("222222222222");
    });

    it("accepts an optional payment screenshot alongside the UTR", async () => {
      const p = await makeProduct(10);
      const order = await placeOrder(p.slug, 1, "psr");
      const res = await submitPayment(
        order.reference,
        { upiReference: "300000000001" },
        { bytes: PNG_BYTES, filename: "proof.png" },
      );
      expect(res.status).toBe("submitted");

      const payment = await prisma.payment.findFirstOrThrow({
        where: { orderId: order.id },
      });
      expect(payment.screenshotStorageKey).not.toBeNull();

      await loginAs(prisma, "PK");
      const bytes = await getPaymentScreenshotBytes({ id: payment.id });
      logout();
      expect(bytes).not.toBeNull();
      expect(bytes!.contentType).toBe("image/png");
    });

    it("still works with no screenshot — it is genuinely optional", async () => {
      const p = await makeProduct(10);
      const order = await placeOrder(p.slug, 1, "psr");
      const res = await submitPayment(order.reference, {
        upiReference: "300000000002",
      });
      expect(res.status).toBe("submitted");

      const payment = await prisma.payment.findFirstOrThrow({
        where: { orderId: order.id },
      });
      expect(payment.screenshotStorageKey).toBeNull();

      await loginAs(prisma, "PK");
      const bytes = await getPaymentScreenshotBytes({ id: payment.id });
      logout();
      expect(bytes).toBeNull();
    });

    it("rejects a non-image file presented as a screenshot; the UTR is not recorded either", async () => {
      const p = await makeProduct(10);
      const order = await placeOrder(p.slug, 1, "psr");
      await expect(
        submitPayment(
          order.reference,
          { upiReference: "300000000003" },
          { bytes: NOT_AN_IMAGE, filename: "proof.pdf" },
        ),
      ).rejects.toMatchObject({ code: "VALIDATION" });

      const payment = await prisma.payment.findFirst({
        where: { orderId: order.id },
      });
      expect(payment).toBeNull();
    });

    it("a later re-submission can attach a screenshot to an existing SUBMITTED payment", async () => {
      const p = await makeProduct(10);
      const order = await placeOrder(p.slug, 1, "psr");
      await submitPayment(order.reference, { upiReference: "300000000004" });
      await submitPayment(
        order.reference,
        { upiReference: "300000000004" },
        { bytes: PNG_BYTES, filename: "proof.png" },
      );

      const payment = await prisma.payment.findFirstOrThrow({
        where: { orderId: order.id },
      });
      expect(payment.screenshotStorageKey).not.toBeNull();

      const audit = await prisma.auditLog.findFirst({
        where: { action: "payment.submit", entityId: payment.id },
        orderBy: { createdAt: "desc" },
      });
      expect((audit?.details as { hasScreenshot?: boolean } | null)?.hasScreenshot).toBe(true);
    });

    it("getPaymentScreenshotBytes requires payments.view", async () => {
      const p = await makeProduct(10);
      const order = await placeOrder(p.slug, 1, "psr");
      await submitPayment(
        order.reference,
        { upiReference: "300000000005" },
        { bytes: PNG_BYTES, filename: "proof.png" },
      );
      const payment = await prisma.payment.findFirstOrThrow({
        where: { orderId: order.id },
      });

      await denyPermission("S1", "payments.view");
      await loginAs(prisma, "S1");
      await expect(
        getPaymentScreenshotBytes({ id: payment.id }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      logout();
    });
  });

  describe("verifyPayment", () => {
    it("verifies: order PAID, stock committed as SALE, bill issued under the assigned partner", async () => {
      const p = await makeProduct(10);
      const order = await placeOrder(p.slug, 2, "psr");
      await submitPayment(order.reference, { upiReference: "900000000001" });

      const payment = await prisma.payment.findFirstOrThrow({
        where: { orderId: order.id },
      });

      await loginAs(prisma, "PK");
      await verifyPayment({ paymentId: payment.id, action: "verify" });
      logout();

      const fresh = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        include: { bill: true },
      });
      expect(fresh.paymentStatus).toBe("PAID");
      expect(fresh.status).toBe("PAID");

      const inv = await prisma.inventory.findUniqueOrThrow({
        where: { productId: p.id },
      });
      expect(inv.quantityOnHand).toBe(8);
      expect(inv.quantityReserved).toBe(0);

      const move = await prisma.inventoryMovement.findFirst({
        where: { productId: p.id, reason: "SALE", refId: order.id },
      });
      expect(move?.changeQty).toBe(-2);

      expect(fresh.bill).not.toBeNull();
      expect(fresh.bill!.userCode).toBe("PSR");
      expect(fresh.bill!.billNumber).toMatch(/^PSR-\d{4}-\d{4}$/);

      const audit = await prisma.auditLog.findFirst({
        where: { action: "payment.verify", entityId: payment.id },
      });
      expect(audit).not.toBeNull();
    });

    it("is idempotent — verifying an already-verified payment is a no-op", async () => {
      const p = await makeProduct(10);
      const order = await placeOrder(p.slug, 1, "psr");
      await submitPayment(order.reference, { upiReference: "900000000002" });
      const payment = await prisma.payment.findFirstOrThrow({
        where: { orderId: order.id },
      });

      await loginAs(prisma, "PK");
      await verifyPayment({ paymentId: payment.id, action: "verify" });
      await verifyPayment({ paymentId: payment.id, action: "verify" });
      logout();

      const bills = await prisma.bill.count({ where: { orderId: order.id } });
      expect(bills).toBe(1);
      const inv = await prisma.inventory.findUniqueOrThrow({
        where: { productId: p.id },
      });
      expect(inv.quantityOnHand).toBe(9);
    });

    it("refuses to verify when the amount does not match the order total", async () => {
      const p = await makeProduct(10);
      const order = await placeOrder(p.slug, 1, "psr");
      await submitPayment(order.reference, { upiReference: "900000000003" });
      const payment = await prisma.payment.findFirstOrThrow({
        where: { orderId: order.id },
      });
      await prisma.payment.update({
        where: { id: payment.id },
        data: { amountPaise: payment.amountPaise - 100 },
      });

      await loginAs(prisma, "PK");
      await expect(
        verifyPayment({ paymentId: payment.id, action: "verify" }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
      logout();

      const fresh = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
      });
      expect(fresh.paymentStatus).toBe("PENDING");
    });

    it("rejects: order PAYMENT_FAILED and the reservation is released", async () => {
      const p = await makeProduct(10);
      const order = await placeOrder(p.slug, 3, "psr");
      await submitPayment(order.reference, { upiReference: "900000000004" });
      const payment = await prisma.payment.findFirstOrThrow({
        where: { orderId: order.id },
      });

      await loginAs(prisma, "PK");
      await verifyPayment({
        paymentId: payment.id,
        action: "reject",
        note: "Money never arrived",
      });
      logout();

      const fresh = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
      });
      expect(fresh.status).toBe("PAYMENT_FAILED");
      expect(fresh.paymentStatus).toBe("FAILED");

      const inv = await prisma.inventory.findUniqueOrThrow({
        where: { productId: p.id },
      });
      expect(inv.quantityReserved).toBe(0);
      expect(inv.quantityOnHand).toBe(10);

      const updated = await prisma.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });
      expect(updated.status).toBe("REJECTED");
    });

    it("staff without payments.confirm_manual cannot verify but can view", async () => {
      const p = await makeProduct(10);
      const order = await placeOrder(p.slug, 1, "psr");
      await submitPayment(order.reference, { upiReference: "900000000005" });
      const payment = await prisma.payment.findFirstOrThrow({
        where: { orderId: order.id },
      });

      await loginAs(prisma, "S1");
      await expect(
        verifyPayment({ paymentId: payment.id, action: "verify" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      const list = await listPayments({});
      expect(list.rows.length).toBeGreaterThan(0);
      logout();
    });
  });

  describe("releaseExpiredHolds", () => {
    it("fails unpaid orders whose hold has lapsed and releases their stock", async () => {
      const p = await makeProduct(10);
      const order = await placeOrder(p.slug, 2, "psr");
      await prisma.order.update({
        where: { id: order.id },
        data: { holdExpiresAt: new Date(Date.now() - 60_000) },
      });

      const { released } = await releaseExpiredHolds();
      expect(released).toBeGreaterThanOrEqual(1);

      const fresh = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
      });
      expect(fresh.status).toBe("PAYMENT_FAILED");

      const inv = await prisma.inventory.findUniqueOrThrow({
        where: { productId: p.id },
      });
      expect(inv.quantityReserved).toBe(0);
    });

    it("does not touch an order whose customer has submitted a payment (awaiting manual verification)", async () => {
      const p = await makeProduct(10);
      const order = await placeOrder(p.slug, 2, "psr");
      await submitPayment(order.reference, { upiReference: "900000000007" });
      await prisma.order.update({
        where: { id: order.id },
        data: { holdExpiresAt: new Date(Date.now() - 60_000) },
      });

      const { released } = await releaseExpiredHolds();
      expect(released).toBe(0);

      const fresh = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
      });
      expect(fresh.status).toBe("AWAITING_PAYMENT");

      const payment = await prisma.payment.findFirstOrThrow({
        where: { orderId: order.id },
      });
      expect(payment.status).toBe("SUBMITTED");

      const inv = await prisma.inventory.findUniqueOrThrow({
        where: { productId: p.id },
      });
      expect(inv.quantityReserved).toBe(2);
    });

    it("does not touch an order with a verified payment", async () => {
      const p = await makeProduct(10);
      const order = await placeOrder(p.slug, 1, "psr");
      await submitPayment(order.reference, { upiReference: "900000000006" });
      const payment = await prisma.payment.findFirstOrThrow({
        where: { orderId: order.id },
      });
      await loginAs(prisma, "PK");
      await verifyPayment({ paymentId: payment.id, action: "verify" });
      logout();

      await prisma.order.update({
        where: { id: order.id },
        data: { holdExpiresAt: new Date(Date.now() - 60_000) },
      });
      await releaseExpiredHolds();

      const fresh = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
      });
      expect(fresh.status).toBe("PAID");
    });
  });

  describe("payment accounts", () => {
    it("each partner reads and edits only their own account", async () => {
      await loginAs(prisma, "PSR");
      const mine = await getMyPaymentAccount();
      expect(mine.partnerCode).toBe("PSR");
      await updateMyPaymentAccount({
        upiVpa: "psr@okhdfcbank",
        payeeName: "PSR Collections",
        instructions: "",
        isActive: true,
      });
      logout();

      const row = await prisma.partnerPaymentAccount.findFirstOrThrow({
        where: { user: { code: "PSR" } },
      });
      expect(row.upiVpa).toBe("psr@okhdfcbank");

      const audit = await prisma.auditLog.findFirst({
        where: { action: "payment_account.update", entityId: row.id },
      });
      expect(audit).not.toBeNull();
    });

    it("requires payments.account.manage (staff are refused)", async () => {
      await loginAs(prisma, "S1");
      await expect(getMyPaymentAccount()).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      logout();
    });
  });
});
