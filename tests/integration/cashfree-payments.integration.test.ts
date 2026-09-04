/**
 * Phase 10 — Cashfree automatic UPI verification. Skipped unless
 * TEST_DATABASE_URL is set (CI provides Postgres).
 *
 * The two functions that make real network calls to Cashfree
 * (`createCashfreeOrder`, `getCashfreeOrderPayments`) are mocked; everything
 * else (signature verification, schema parsing, credential lookup, and the
 * whole payments-service transaction) runs for real.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHmac } from "node:crypto";
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
import { updateMyPaymentAccount } from "@/server/services/payment-accounts-service";
import {
  createCashfreeCheckoutSession,
  handleCashfreeWebhook,
  reconcileCashfreePayments,
} from "@/server/services/payments-service";

const d = TEST_DB ? describe : describe.skip;

const PARTNER_CODE = "PK";
const SECRET = "sandbox-secret-for-tests";

vi.mock("@/server/integrations/payment/cashfree", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/server/integrations/payment/cashfree")>();
  return {
    ...actual,
    createCashfreeOrder: vi.fn(async (_creds, input) => ({
      cfOrderId: `cf_${input.orderId}`,
      paymentSessionId: `session_${input.orderId}`,
    })),
    getCashfreeOrderPayments: vi.fn(async () => []),
  };
});

import * as cashfreeModule from "@/server/integrations/payment/cashfree";

const CUSTOMER = {
  name: "Cashfree Buyer",
  phone: "9876500055",
  addressLine1: "5 Gateway Road",
  city: "Sivakasi",
  stateCode: "33",
  pincode: "626123",
};

let seq = 0;

function sign(timestamp: string, rawBody: string): string {
  return createHmac("sha256", SECRET).update(timestamp + rawBody).digest("base64");
}

function webhookBody(opts: {
  orderRef: string;
  orderAmountPaise: number;
  paymentAmountPaise?: number;
  status?: string;
}): string {
  return JSON.stringify({
    type: "PAYMENT_SUCCESS_WEBHOOK",
    data: {
      order: {
        order_id: opts.orderRef,
        order_amount: opts.orderAmountPaise / 100,
      },
      payment: {
        cf_payment_id: 100001,
        payment_status: opts.status ?? "SUCCESS",
        payment_amount: (opts.paymentAmountPaise ?? opts.orderAmountPaise) / 100,
        bank_reference: "UTR12345678",
      },
    },
  });
}

async function makeProduct(stock: number, pricePaise = 50000) {
  seq += 1;
  const sku = `CF-${seq}`;
  const category = await prisma.category.upsert({
    where: { slug: "cf-cat" },
    update: {},
    create: { name: "Cf Cat", slug: "cf-cat", isActive: true },
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

async function placeOrder(qty = 1) {
  const p = await makeProduct(20);
  logout();
  const { reference } = await createOnlineOrder(
    { items: [{ slug: p.slug, quantity: qty }], customer: CUSTOMER },
    { partnerCode: PARTNER_CODE.toLowerCase() },
  );
  return prisma.order.findUniqueOrThrow({ where: { reference } });
}

async function onboardPartnerWithCashfree() {
  process.env[`CASHFREE_APP_ID_${PARTNER_CODE}`] = "test-app-id";
  process.env[`CASHFREE_SECRET_KEY_${PARTNER_CODE}`] = SECRET;
  await loginAs(prisma, PARTNER_CODE);
  await updateMyPaymentAccount({
    upiVpa: "",
    payeeName: "",
    instructions: "",
    isActive: "true",
    pspProvider: "CASHFREE",
    pspAccountId: "test-app-id",
  });
  logout();
}

d("Phase 10 — Cashfree automatic verification", () => {
  beforeEach(async () => {
    await resetCatalogue(prisma);
    _resetRateLimits();
    logout();
    seq = 0;
    vi.clearAllMocks();
    delete process.env[`CASHFREE_APP_ID_${PARTNER_CODE}`];
    delete process.env[`CASHFREE_SECRET_KEY_${PARTNER_CODE}`];
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

  describe("hybrid rollout", () => {
    it("refuses a Cashfree checkout session when the partner has not onboarded", async () => {
      const order = await placeOrder();
      await expect(
        createCashfreeCheckoutSession(order.reference),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });
  });

  describe("checkout session", () => {
    it("creates a Cashfree order and returns a payment session id", async () => {
      await onboardPartnerWithCashfree();
      const order = await placeOrder();

      const result = await createCashfreeCheckoutSession(order.reference);
      expect(result.paymentSessionId).toBe(`session_${order.reference}`);
      expect(cashfreeModule.createCashfreeOrder).toHaveBeenCalledTimes(1);

      const payment = await prisma.payment.findFirst({
        where: { orderId: order.id, provider: "CASHFREE" },
      });
      expect(payment?.status).toBe("INITIATED");
    });

    it("reuses an existing session instead of creating a new Cashfree order", async () => {
      await onboardPartnerWithCashfree();
      const order = await placeOrder();

      await createCashfreeCheckoutSession(order.reference);
      await createCashfreeCheckoutSession(order.reference);
      expect(cashfreeModule.createCashfreeOrder).toHaveBeenCalledTimes(1);
    });
  });

  describe("webhook", () => {
    it("marks the order PAID on a validly signed success webhook", async () => {
      await onboardPartnerWithCashfree();
      const order = await placeOrder();
      await createCashfreeCheckoutSession(order.reference);

      const body = webhookBody({
        orderRef: order.reference,
        orderAmountPaise: order.totalPaise,
      });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = sign(timestamp, body);

      const result = await handleCashfreeWebhook(body, signature, timestamp);
      expect(result.handled).toBe(true);

      const fresh = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
      });
      expect(fresh.status).toBe("PAID");
      expect(fresh.paymentStatus).toBe("PAID");

      const payment = await prisma.payment.findFirstOrThrow({
        where: { orderId: order.id, provider: "CASHFREE" },
      });
      expect(payment.status).toBe("VERIFIED");
      expect(payment.verificationMethod).toBe("WEBHOOK");
      expect(payment.upiReference).toBe("UTR12345678");

      const bill = await prisma.bill.findUnique({ where: { orderId: order.id } });
      expect(bill).not.toBeNull();

      const audit = await prisma.auditLog.findFirst({
        where: { action: "payment.verify", entityId: payment.id },
      });
      expect(audit?.actorUserId).toBeNull(); // system-attributed, not a human
    });

    it("rejects a webhook with an invalid signature and leaves the order unpaid", async () => {
      await onboardPartnerWithCashfree();
      const order = await placeOrder();
      await createCashfreeCheckoutSession(order.reference);

      const body = webhookBody({
        orderRef: order.reference,
        orderAmountPaise: order.totalPaise,
      });
      const timestamp = String(Math.floor(Date.now() / 1000));

      await expect(
        handleCashfreeWebhook(body, "bogus-signature-value-xxxxxxxxxxxxxxx", timestamp),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      const fresh = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(fresh.paymentStatus).not.toBe("PAID");
    });

    it("is idempotent — replaying the same successful webhook only applies once", async () => {
      await onboardPartnerWithCashfree();
      const order = await placeOrder();
      await createCashfreeCheckoutSession(order.reference);

      const body = webhookBody({
        orderRef: order.reference,
        orderAmountPaise: order.totalPaise,
      });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = sign(timestamp, body);

      const first = await handleCashfreeWebhook(body, signature, timestamp);
      const second = await handleCashfreeWebhook(body, signature, timestamp);
      expect(first.handled).toBe(true);
      expect(second.handled).toBe(false); // already PAID — no-op

      const movements = await prisma.inventoryMovement.count({
        where: { refId: order.id, reason: "SALE" },
      });
      expect(movements).toBe(1); // stock committed exactly once
    });

    it("does not mark the order paid when the webhook amount does not match", async () => {
      await onboardPartnerWithCashfree();
      const order = await placeOrder();
      await createCashfreeCheckoutSession(order.reference);

      const body = webhookBody({
        orderRef: order.reference,
        orderAmountPaise: order.totalPaise,
        paymentAmountPaise: order.totalPaise, // order-level amount below is what's checked first
      });
      const tampered = JSON.parse(body);
      tampered.data.order.order_amount = order.totalPaise / 100 - 1; // wrong
      const rawTampered = JSON.stringify(tampered);
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = sign(timestamp, rawTampered);

      const result = await handleCashfreeWebhook(rawTampered, signature, timestamp);
      expect(result.handled).toBe(false);

      const fresh = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(fresh.paymentStatus).not.toBe("PAID");
    });

    it("ignores a webhook for an order whose partner has not onboarded with Cashfree", async () => {
      // `onboardPartnerWithCashfree()` is deliberately not called here — the
      // order's assigned partner (PK) has pspProvider = null, so this must be
      // a harmless "nothing to do" well before any signature is checked.
      const order = await placeOrder();
      const body = webhookBody({
        orderRef: order.reference,
        orderAmountPaise: order.totalPaise,
      });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = sign(timestamp, body);
      const result = await handleCashfreeWebhook(body, signature, timestamp);
      expect(result.handled).toBe(false);
    });
  });

  describe("reconciliation sweep", () => {
    it("verifies a payment stuck INITIATED once Cashfree reports it as SUCCESS", async () => {
      await onboardPartnerWithCashfree();
      const order = await placeOrder();
      await createCashfreeCheckoutSession(order.reference);

      // Back-date the payment so it looks stuck past the reconciliation cutoff.
      await prisma.payment.updateMany({
        where: { orderId: order.id, provider: "CASHFREE" },
        data: { createdAt: new Date(Date.now() - 10 * 60_000) },
      });

      vi.mocked(cashfreeModule.getCashfreeOrderPayments).mockResolvedValueOnce([
        {
          cfPaymentId: "999",
          status: "SUCCESS",
          amountPaise: order.totalPaise,
          bankReference: "UTR-RECON-1",
        },
      ]);

      const result = await reconcileCashfreePayments();
      expect(result.verified).toBe(1);

      const fresh = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(fresh.status).toBe("PAID");

      const payment = await prisma.payment.findFirstOrThrow({
        where: { orderId: order.id, provider: "CASHFREE" },
      });
      expect(payment.verificationMethod).toBe("PSP_API");
    });

    it("leaves a recent INITIATED payment alone (not past the cutoff)", async () => {
      await onboardPartnerWithCashfree();
      const order = await placeOrder();
      await createCashfreeCheckoutSession(order.reference);

      const result = await reconcileCashfreePayments();
      expect(result.checked).toBe(0);

      const fresh = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(fresh.paymentStatus).not.toBe("PAID");
    });
  });
});
