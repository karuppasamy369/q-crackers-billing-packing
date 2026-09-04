/**
 * Phase 8 integration tests — WhatsApp notification outbox + delivery worker.
 * Skipped unless TEST_DATABASE_URL is set (CI provides Postgres).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
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
  markOrderPacked,
  confirmParcelBooked,
  uploadLrDocument,
} from "@/server/services/booking-service";
import {
  enqueueNotification,
  enqueueNotificationSafe,
  processNotificationOutbox,
  listNotifications,
  retryNotification,
  requestReviewNotification,
} from "@/server/services/notifications-service";
import { _setWhatsAppProvider } from "@/server/integrations/notifications";
import type {
  WhatsAppProvider,
  OutboundMessage,
  SendOutcome,
} from "@/server/integrations/notifications";

const d = TEST_DB ? describe : describe.skip;

const CUSTOMER = {
  name: "Aniketh Rao",
  phone: "9876500777",
  addressLine1: "12 Rocket Street",
  city: "Sivakasi",
  stateCode: "33",
  pincode: "626123",
};

const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF\n");

// --- controllable stub provider -------------------------------------------

class StubProvider implements WhatsAppProvider {
  name = "stub";
  configured = true;
  calls: OutboundMessage[] = [];
  outcome: (
    call: OutboundMessage,
    n: number,
  ) => SendOutcome | Promise<SendOutcome>;

  constructor(
    outcome: StubProvider["outcome"] = () => ({
      ok: true,
      providerMessageId: "stub_ok",
    }),
  ) {
    this.outcome = outcome;
  }

  async send(message: OutboundMessage): Promise<SendOutcome> {
    this.calls.push(message);
    return this.outcome(message, this.calls.length);
  }
}

class UnconfiguredProvider implements WhatsAppProvider {
  name = "none";
  configured = false;
  async send(): Promise<SendOutcome> {
    return { ok: false, retryable: true, error: "not configured" };
  }
}

let seq = 0;

async function makeProduct(stock = 20) {
  seq += 1;
  const sku = `NOT-${seq}`;
  const category = await prisma.category.upsert({
    where: { slug: "not-cat" },
    update: {},
    create: { name: "Not Cat", slug: "not-cat", isActive: true },
  });
  return prisma.product.create({
    data: {
      sku,
      slug: sku.toLowerCase(),
      name: sku,
      categoryId: category.id,
      pricePaise: 20000,
      gstRateBp: 1800,
      isActive: true,
      isVisibleOnline: true,
      inventory: { create: { quantityOnHand: stock } },
    },
  });
}

async function placeOrder(locale?: string) {
  logout();
  const p = await makeProduct();
  const { reference } = await createOnlineOrder(
    { items: [{ slug: p.slug, quantity: 1 }], customer: CUSTOMER },
    { partnerCode: "psr", locale: locale ?? null },
  );
  return prisma.order.findUniqueOrThrow({ where: { reference } });
}

async function makePaidOrder(locale?: string) {
  const order = await placeOrder(locale);
  await submitPayment(order.reference, {
    upiReference: `NOT${seq}${Date.now()}`.toUpperCase().slice(0, 30),
  });
  const payment = await prisma.payment.findFirstOrThrow({
    where: { orderId: order.id },
  });
  await loginAs(prisma, "PK");
  await verifyPayment({ paymentId: payment.id, action: "verify" });
  logout();
  return prisma.order.findUniqueOrThrow({ where: { id: order.id } });
}

function rowFor(orderId: string, eventType: string) {
  return prisma.notificationOutbox.findUniqueOrThrow({
    where: { dedupeKey: `${orderId}:${eventType}` },
  });
}

d("Phase 8 — WhatsApp notifications", () => {
  beforeEach(async () => {
    await resetCatalogue(prisma);
    await prisma.userPermission.deleteMany();
    _resetRateLimits();
    _setWhatsAppProvider(new StubProvider());
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

  afterEach(() => {
    _setWhatsAppProvider(undefined);
  });

  // -----------------------------------------------------------------------
  // Creation + the five events
  // -----------------------------------------------------------------------

  it("verifying a payment queues a PAYMENT_RECEIVED notification", async () => {
    const order = await makePaidOrder();
    const row = await rowFor(order.id, "PAYMENT_RECEIVED");
    expect(row.status).toBe("PENDING");
    expect(row.recipientPhone).toBe("+919876500777");
    expect(row.dedupeKey).toBe(`${order.id}:PAYMENT_RECEIVED`);
    expect(row.channel).toBe("WHATSAPP");
  });

  it("the full order flow produces one row per event type", async () => {
    const order = await makePaidOrder();
    await loginAs(prisma, "PK");
    await markOrderPacked({ orderId: order.id });
    await confirmParcelBooked({
      orderId: order.id,
      courierName: "Professional Couriers",
      lrNumber: "TN-2026/5000",
      bookingDate: new Date().toISOString().slice(0, 10),
      parcelCount: "2",
      remarks: "",
    });
    await uploadLrDocument({ orderId: order.id }, PDF, "lr.pdf");
    await requestReviewNotification({ orderId: order.id });
    logout();

    const rows = await prisma.notificationOutbox.findMany({
      where: { orderId: order.id },
    });
    expect(new Set(rows.map((r) => r.eventType))).toEqual(
      new Set([
        "PAYMENT_RECEIVED",
        "ORDER_PACKED",
        "PARCEL_BOOKED",
        "LR_AVAILABLE",
        "REVIEW_REQUEST",
      ]),
    );
  });

  it("enqueue is idempotent — the same event never duplicates", async () => {
    const order = await makePaidOrder();
    const a = await enqueueNotification({
      orderId: order.id,
      eventType: "PAYMENT_RECEIVED",
    });
    const b = await enqueueNotification({
      orderId: order.id,
      eventType: "PAYMENT_RECEIVED",
    });
    expect(a).toBe("duplicate"); // already made by verifyPayment
    expect(b).toBe("duplicate");
    expect(
      await prisma.notificationOutbox.count({
        where: { orderId: order.id, eventType: "PAYMENT_RECEIVED" },
      }),
    ).toBe(1);
  });

  // -----------------------------------------------------------------------
  // Delivery, retry, permanent failure
  // -----------------------------------------------------------------------

  it("delivers a pending message once and records the provider id", async () => {
    const stub = new StubProvider();
    _setWhatsAppProvider(stub);
    const order = await makePaidOrder();

    const s1 = await processNotificationOutbox();
    expect(s1.sent).toBeGreaterThanOrEqual(1);

    const row = await rowFor(order.id, "PAYMENT_RECEIVED");
    expect(row.status).toBe("SENT");
    expect(row.sentAt).not.toBeNull();
    expect(row.providerMessageId).toBe("stub_ok");
    expect(row.provider).toBe("stub");
    expect(row.renderedBody).toContain("Q Crackers");

    // A second run must not re-send.
    const before = stub.calls.length;
    await processNotificationOutbox();
    expect(stub.calls.length).toBe(before);
  });

  it("retries a transient failure with backoff, then succeeds", async () => {
    let fail = true;
    _setWhatsAppProvider(
      new StubProvider(() =>
        fail
          ? { ok: false, retryable: true, error: "HTTP 503" }
          : { ok: true, providerMessageId: "stub_ok" },
      ),
    );
    const order = await makePaidOrder();

    await processNotificationOutbox();
    let row = await rowFor(order.id, "PAYMENT_RECEIVED");
    expect(row.status).toBe("FAILED");
    expect(row.attempts).toBe(1);
    expect(row.nextAttemptAt).not.toBeNull();

    // Make it due again, let it succeed.
    fail = false;
    await prisma.notificationOutbox.update({
      where: { id: row.id },
      data: { nextAttemptAt: new Date(Date.now() - 1000) },
    });
    await processNotificationOutbox();
    row = await rowFor(order.id, "PAYMENT_RECEIVED");
    expect(row.status).toBe("SENT");
    expect(row.attempts).toBe(2);
  });

  it("marks a non-retryable failure DEAD immediately and never retries it", async () => {
    _setWhatsAppProvider(
      new StubProvider(() => ({
        ok: false,
        retryable: false,
        error: "HTTP 400 invalid recipient",
      })),
    );
    const order = await makePaidOrder();

    await processNotificationOutbox();
    const row = await rowFor(order.id, "PAYMENT_RECEIVED");
    expect(row.status).toBe("DEAD");
    expect(row.attempts).toBe(1);
    expect(row.nextAttemptAt).toBeNull();

    const stub = new StubProvider();
    _setWhatsAppProvider(stub);
    await processNotificationOutbox();
    expect(stub.calls.length).toBe(0);
  });

  it("gives up (DEAD) after maxAttempts transient failures", async () => {
    _setWhatsAppProvider(
      new StubProvider(() => ({
        ok: false,
        retryable: true,
        error: "HTTP 503",
      })),
    );
    const order = await makePaidOrder();
    const key = `${order.id}:PAYMENT_RECEIVED`;

    for (let i = 0; i < 10; i++) {
      await processNotificationOutbox();
      await prisma.notificationOutbox.updateMany({
        where: { dedupeKey: key, status: "FAILED" },
        data: { nextAttemptAt: new Date(Date.now() - 1000) },
      });
    }
    const row = await prisma.notificationOutbox.findUniqueOrThrow({
      where: { dedupeKey: key },
    });
    expect(row.status).toBe("DEAD");
    expect(row.attempts).toBe(row.maxAttempts);
  });

  it("a provider that throws is treated as transient — the run does not crash", async () => {
    _setWhatsAppProvider(
      new StubProvider(() => {
        throw new Error("boom Bearer sk_live_leak");
      }),
    );
    const order = await makePaidOrder();
    const summary = await processNotificationOutbox();
    expect(summary.failed).toBeGreaterThanOrEqual(1);
    const row = await rowFor(order.id, "PAYMENT_RECEIVED");
    expect(row.status).toBe("FAILED");
    expect(row.lastError).not.toContain("sk_live_leak");
    expect(row.lastError).toContain("[redacted]");
  });

  // -----------------------------------------------------------------------
  // Phone handling
  // -----------------------------------------------------------------------

  it("skips (does not send) when the customer has no usable phone", async () => {
    const order = await makePaidOrder();
    await prisma.notificationOutbox.deleteMany({
      where: { orderId: order.id },
    });
    await prisma.order.update({
      where: { id: order.id },
      data: { customerPhone: "notaphone" },
    });

    const result = await enqueueNotification({
      orderId: order.id,
      eventType: "PAYMENT_RECEIVED",
    });
    expect(result).toBe("skipped");

    const row = await rowFor(order.id, "PAYMENT_RECEIVED");
    expect(row.status).toBe("SKIPPED");
    expect(row.recipientPhone).toBeNull();

    const stub = new StubProvider();
    _setWhatsAppProvider(stub);
    await processNotificationOutbox();
    expect(stub.calls.length).toBe(0);
  });

  it("treats an invalid (non-Indian-mobile) number as no phone", async () => {
    const order = await makePaidOrder();
    await prisma.notificationOutbox.deleteMany({
      where: { orderId: order.id },
    });
    await prisma.order.update({
      where: { id: order.id },
      data: { customerPhone: "12345" },
    });
    const result = await enqueueNotification({
      orderId: order.id,
      eventType: "PAYMENT_RECEIVED",
    });
    expect(result).toBe("skipped");
  });

  // -----------------------------------------------------------------------
  // Provider-not-configured
  // -----------------------------------------------------------------------

  it("holds messages (no send, no attempt spent) while the provider is not configured", async () => {
    _setWhatsAppProvider(new UnconfiguredProvider());
    const order = await makePaidOrder();

    const summary = await processNotificationOutbox();
    expect(summary.held).toBeGreaterThanOrEqual(1);
    expect(summary.sent).toBe(0);

    const row = await rowFor(order.id, "PAYMENT_RECEIVED");
    expect(row.status).toBe("PENDING");
    expect(row.attempts).toBe(0);
    expect(row.lastError).toMatch(/not configured/i);
    expect(row.nextAttemptAt).not.toBeNull();

    // Configure a provider — the backlog delivers.
    await prisma.notificationOutbox.update({
      where: { id: row.id },
      data: { nextAttemptAt: new Date(Date.now() - 1000) },
    });
    _setWhatsAppProvider(new StubProvider());
    await processNotificationOutbox();
    expect((await rowFor(order.id, "PAYMENT_RECEIVED")).status).toBe("SENT");
  });

  // -----------------------------------------------------------------------
  // Order flow safety
  // -----------------------------------------------------------------------

  it("enqueueNotificationSafe never throws (a bad order id is swallowed)", async () => {
    await expect(
      enqueueNotificationSafe({
        orderId: "00000000-0000-4000-8000-000000000000",
        eventType: "ORDER_PACKED",
      }),
    ).resolves.toBeUndefined();
  });

  it("payment verification still succeeds when the notification enqueue path is exercised", async () => {
    // makePaidOrder runs verifyPayment, which calls enqueueNotificationSafe.
    const order = await makePaidOrder();
    expect(order.status).toBe("PAID");
    expect(order.paymentStatus).toBe("PAID");
  });

  // -----------------------------------------------------------------------
  // Concurrency
  // -----------------------------------------------------------------------

  it("two concurrent worker runs deliver each message exactly once", async () => {
    const stub = new StubProvider();
    _setWhatsAppProvider(stub);
    const a = await makePaidOrder();
    const b = await makePaidOrder();

    await Promise.all([
      processNotificationOutbox(),
      processNotificationOutbox(),
    ]);

    // Exactly two messages, each sent once.
    expect(stub.calls.length).toBe(2);
    for (const order of [a, b]) {
      expect((await rowFor(order.id, "PAYMENT_RECEIVED")).status).toBe("SENT");
    }
  });

  // -----------------------------------------------------------------------
  // Reconciliation
  // -----------------------------------------------------------------------

  it("reconciles an event whose best-effort enqueue was lost", async () => {
    const stub = new StubProvider();
    _setWhatsAppProvider(stub);
    const order = await makePaidOrder();
    // Simulate a crash between commit and enqueue.
    await prisma.notificationOutbox.deleteMany({
      where: { orderId: order.id },
    });

    await processNotificationOutbox();

    const row = await rowFor(order.id, "PAYMENT_RECEIVED");
    expect(row.status).toBe("SENT");
  });

  // -----------------------------------------------------------------------
  // Privacy / redaction
  // -----------------------------------------------------------------------

  it("the rendered message contains no address, phone digits, or database ids", async () => {
    _setWhatsAppProvider(new StubProvider());
    const order = await makePaidOrder();
    await processNotificationOutbox();
    const row = await rowFor(order.id, "PAYMENT_RECEIVED");
    const body = row.renderedBody ?? "";
    expect(body).toContain(CUSTOMER.name);
    expect(body).not.toContain(CUSTOMER.addressLine1);
    expect(body).not.toContain(CUSTOMER.pincode);
    expect(body).not.toContain("9876500777");
    expect(body).not.toContain(order.id);
    expect(body).not.toContain(order.reference);
  });

  // -----------------------------------------------------------------------
  // Locale
  // -----------------------------------------------------------------------

  it("renders Tamil for an order placed in Tamil", async () => {
    _setWhatsAppProvider(new StubProvider());
    const order = await makePaidOrder("ta");
    expect(order.locale).toBe("ta");
    await processNotificationOutbox();
    const row = await rowFor(order.id, "PAYMENT_RECEIVED");
    expect(row.locale).toBe("ta");
    // The Tamil template contains Tamil script.
    expect(row.renderedBody ?? "").toMatch(/[஀-௿]/);
  });

  // -----------------------------------------------------------------------
  // RBAC
  // -----------------------------------------------------------------------

  it("only notifications.manage may view the outbox / retry / request reviews", async () => {
    const order = await makePaidOrder();
    await loginAs(prisma, "PK");
    await markOrderPacked({ orderId: order.id });
    await confirmParcelBooked({
      orderId: order.id,
      courierName: "DTDC",
      lrNumber: "LR-1",
      bookingDate: new Date().toISOString().slice(0, 10),
      parcelCount: "1",
      remarks: "",
    });
    logout();
    const row = await rowFor(order.id, "PAYMENT_RECEIVED");

    await loginAs(prisma, "S1"); // staff — no notifications.manage
    await expect(listNotifications({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(retryNotification({ id: row.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      requestReviewNotification({ orderId: order.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    logout();

    await loginAs(prisma, "PSR"); // partner
    const list = await listNotifications({});
    expect(list.total).toBeGreaterThan(0);
    // masked recipient only — never the full number
    expect(JSON.stringify(list.rows)).not.toContain("9876500777");
    const review = await requestReviewNotification({ orderId: order.id });
    expect(["enqueued", "skipped"]).toContain(review);
    logout();
  });

  it("a partner can re-queue a DEAD notification", async () => {
    _setWhatsAppProvider(
      new StubProvider(() => ({
        ok: false,
        retryable: false,
        error: "HTTP 400",
      })),
    );
    const order = await makePaidOrder();
    await processNotificationOutbox();
    const dead = await rowFor(order.id, "PAYMENT_RECEIVED");
    expect(dead.status).toBe("DEAD");

    _setWhatsAppProvider(new StubProvider());
    await loginAs(prisma, "PSR");
    await retryNotification({ id: dead.id });
    logout();

    let row = await rowFor(order.id, "PAYMENT_RECEIVED");
    expect(row.status).toBe("PENDING");
    expect(row.attempts).toBe(0);

    await processNotificationOutbox();
    row = await rowFor(order.id, "PAYMENT_RECEIVED");
    expect(row.status).toBe("SENT");
  });
});
