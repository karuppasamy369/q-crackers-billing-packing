/**
 * Phase 9 integration tests — audit-log viewing, filters, redaction, RBAC.
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
import { listAuditLogs } from "@/server/services/audit-query";

const d = TEST_DB ? describe : describe.skip;

const CUSTOMER = {
  name: "Audit Buyer",
  phone: "9876000999",
  addressLine1: "5 Log Street",
  city: "Sivakasi",
  stateCode: "33",
  pincode: "626123",
};

let seq = 0;

async function makeProduct() {
  seq += 1;
  const sku = `AUD-${seq}`;
  const category = await prisma.category.upsert({
    where: { slug: "aud-cat" },
    update: {},
    create: { name: "Aud Cat", slug: "aud-cat", isActive: true },
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
      inventory: { create: { quantityOnHand: 20 } },
    },
  });
}

async function makePaidOrder() {
  logout();
  const p = await makeProduct();
  const { reference } = await createOnlineOrder(
    { items: [{ slug: p.slug, quantity: 1 }], customer: CUSTOMER },
    { partnerCode: "psr" },
  );
  const order = await prisma.order.findUniqueOrThrow({ where: { reference } });
  await submitPayment(reference, {
    upiReference: `AUD${seq}${Date.now()}`.toUpperCase().slice(0, 30),
  });
  const payment = await prisma.payment.findFirstOrThrow({
    where: { orderId: order.id },
  });
  await loginAs(prisma, "PK");
  await verifyPayment({ paymentId: payment.id, action: "verify" });
  logout();
  return order;
}

d("Phase 9 — audit log", () => {
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

  it("a partner sees all actions and can filter by action + entity id", async () => {
    const order = await makePaidOrder();
    await loginAs(prisma, "PK");

    const all = await listAuditLogs({});
    expect(all.scopedToSelf).toBe(false);
    expect(all.total).toBeGreaterThan(0);

    const byAction = await listAuditLogs({ action: "payment.verify" });
    expect(byAction.rows.length).toBeGreaterThan(0);
    expect(
      byAction.rows.every((r) => r.action.includes("payment.verify")),
    ).toBe(true);

    const byOrder = await listAuditLogs({ q: order.id });
    expect(byOrder.rows.length).toBeGreaterThan(0);
    expect(
      byOrder.rows.every(
        (r) => r.entityId === order.id || r.summary.includes(order.id),
      ),
    ).toBe(true);

    logout();
  });

  it("filters by date range", async () => {
    await makePaidOrder();
    await loginAs(prisma, "PK");

    const today = new Date().toISOString().slice(0, 10);
    const inRange = await listAuditLogs({ dateFrom: today, dateTo: today });
    expect(inRange.total).toBeGreaterThan(0);

    const future = "2099-01-01";
    const outOfRange = await listAuditLogs({
      dateFrom: future,
      dateTo: future,
    });
    expect(outOfRange.total).toBe(0);
    logout();
  });

  it("staff with audit.view_own are hard-scoped to their own actions", async () => {
    // PK verifies a payment (audited as PK).
    await makePaidOrder();
    // S1 does nothing auditable.
    await loginAs(prisma, "S1");
    const mine = await listAuditLogs({ actorCode: "PK" }); // filter is ignored
    expect(mine.scopedToSelf).toBe(true);
    expect(mine.rows.every((r) => r.actorCode === "S1")).toBe(true);
    logout();
  });

  it("never exposes payment secrets in audit details", async () => {
    const order = await makePaidOrder();
    // The customer submitted a UTR — find it.
    const payment = await prisma.payment.findFirstOrThrow({
      where: { orderId: order.id },
    });
    await loginAs(prisma, "PK");
    const rows = await listAuditLogs({ q: order.id, page: 1 });
    logout();

    const json = JSON.stringify(rows.rows);
    // Customer contact details must not appear.
    expect(json).not.toContain(CUSTOMER.phone);
    expect(json).not.toContain(CUSTOMER.addressLine1);
    // Sensitive keys are redacted by recordAudit before storage.
    for (const r of rows.rows) {
      const d = r.details as Record<string, unknown> | null;
      if (d && "token" in d) expect(d.token).toBe("[redacted]");
      if (d && "tokenHash" in d) expect(d.tokenHash).toBe("[redacted]");
    }
    // The UTR itself is fine to appear (it is not a secret credential), but
    // there must be no password / access token anywhere.
    expect(json.toLowerCase()).not.toContain("passwordhash");
    expect(payment.upiReference).toBeTruthy();
  });
});
