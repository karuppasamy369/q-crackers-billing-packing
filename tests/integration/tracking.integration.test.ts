/**
 * Phase 7 integration tests — public customer tracking tokens.
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
import { getDictionary } from "@/lib/i18n";
import { sha256Hex } from "@/server/auth/tokens";
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
  hashTrackingToken,
  ensureTrackingTokenForOrder,
  regenerateTrackingToken,
  revokeTrackingToken,
  getTrackingAdminInfo,
  getPublicTrackingByToken,
  getPublicTrackingLrByToken,
} from "@/server/services/tracking-service";

const d = TEST_DB ? describe : describe.skip;

const CUSTOMER = {
  name: "Ravi Kumar",
  phone: "9876512345",
  email: "ravi@example.com",
  addressLine1: "42 Fireworks Lane",
  addressLine2: "Near the temple",
  city: "Sivakasi",
  stateCode: "33",
  pincode: "626189",
};

const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF\n");
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

let seq = 0;

async function makeProduct(stock = 20) {
  seq += 1;
  const sku = `TRK-${seq}`;
  const category = await prisma.category.upsert({
    where: { slug: "trk-cat" },
    update: {},
    create: { name: "Trk Cat", slug: "trk-cat", isActive: true },
  });
  return prisma.product.create({
    data: {
      sku,
      slug: sku.toLowerCase(),
      name: sku,
      categoryId: category.id,
      pricePaise: 25000,
      gstRateBp: 1800,
      isActive: true,
      isVisibleOnline: true,
      inventory: { create: { quantityOnHand: stock } },
    },
  });
}

async function placeOrder() {
  logout();
  const p = await makeProduct();
  const { reference } = await createOnlineOrder(
    { items: [{ slug: p.slug, quantity: 1 }], customer: CUSTOMER },
    { partnerCode: "psr" },
  );
  return prisma.order.findUniqueOrThrow({ where: { reference } });
}

async function makePaidOrder() {
  const order = await placeOrder();
  await submitPayment(order.reference, {
    upiReference: `TRK${seq}${Date.now()}`.toUpperCase().slice(0, 30),
  });
  const payment = await prisma.payment.findFirstOrThrow({
    where: { orderId: order.id },
  });
  await loginAs(prisma, "PK");
  await verifyPayment({ paymentId: payment.id, action: "verify" });
  logout();
  return prisma.order.findUniqueOrThrow({ where: { id: order.id } });
}

/** Issue a token and return its raw value (created fresh). */
async function issueToken(orderId: string) {
  const res = await ensureTrackingTokenForOrder(orderId);
  expect(res.created).toBe(true);
  return res.token!;
}

d("Phase 7 — customer tracking tokens", () => {
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

  // -------------------------------------------------------------------------
  // Token generation, entropy, storage
  // -------------------------------------------------------------------------

  describe("token generation & storage", () => {
    it("generates a high-entropy base64url token", async () => {
      const order = await makePaidOrder();
      const token = await issueToken(order.id);
      expect(token).toMatch(TOKEN_RE);
    });

    it("tokens are unique across many generations (no low-entropy repeats)", async () => {
      const order = await makePaidOrder();
      await loginAs(prisma, "PK");
      const seen = new Set<string>();
      for (let i = 0; i < 60; i++) {
        const { token } = await regenerateTrackingToken({ orderId: order.id });
        expect(token).toMatch(TOKEN_RE);
        seen.add(token);
      }
      logout();
      expect(seen.size).toBe(60);
    });

    it("persists ONLY the SHA-256 hash — never the raw token", async () => {
      const order = await makePaidOrder();
      const token = await issueToken(order.id);

      const row = await prisma.trackingToken.findUniqueOrThrow({
        where: { orderId: order.id },
      });
      expect(row.tokenHash).toBe(sha256Hex(token));
      expect(row.tokenHash).toBe(hashTrackingToken(token));
      expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      // The raw token must not appear anywhere on the row.
      expect(JSON.stringify(row)).not.toContain(token);
    });

    it("is idempotent — a second ensure does not mint another token", async () => {
      const order = await makePaidOrder();
      const first = await ensureTrackingTokenForOrder(order.id);
      const second = await ensureTrackingTokenForOrder(order.id);
      expect(first.created).toBe(true);
      expect(second).toEqual({ created: false, token: null });
      expect(
        await prisma.trackingToken.count({ where: { orderId: order.id } }),
      ).toBe(1);
    });

    it("two concurrent creations yield exactly one token and one row", async () => {
      const order = await makePaidOrder();
      const [a, b] = await Promise.all([
        ensureTrackingTokenForOrder(order.id),
        ensureTrackingTokenForOrder(order.id),
      ]);
      const createdCount = [a, b].filter((r) => r.created).length;
      expect(createdCount).toBe(1);
      expect(
        await prisma.trackingToken.count({ where: { orderId: order.id } }),
      ).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Resolution, enumeration, eligibility
  // -------------------------------------------------------------------------

  describe("resolution & eligibility", () => {
    it("a valid token resolves the correct order", async () => {
      const order = await makePaidOrder();
      const token = await issueToken(order.id);
      const dto = await getPublicTrackingByToken(token);
      expect(dto.publicRef).toBe(
        `QC-${sha256Hex(order.id).slice(0, 8).toUpperCase()}`,
      );
      expect(dto.status).toBe("PAID");
    });

    it("an invalid token returns a generic not-found (no order info)", async () => {
      await expect(
        getPublicTrackingByToken("z".repeat(43)),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("token enumeration cannot reveal whether an order exists", async () => {
      // Unpaid order with a token forced in directly (bypassing eligibility).
      const unpaid = await placeOrder();
      const raw = "e".repeat(43);
      await prisma.trackingToken.create({
        data: { orderId: unpaid.id, tokenHash: hashTrackingToken(raw) },
      });

      const missing = await getPublicTrackingByToken("m".repeat(43)).catch(
        (e) => e,
      );
      const unpaidHit = await getPublicTrackingByToken(raw).catch((e) => e);

      expect(missing.code).toBe("NOT_FOUND");
      expect(unpaidHit.code).toBe("NOT_FOUND");
      // Identical response → an attacker learns nothing.
      expect(unpaidHit.publicMessage).toBe(missing.publicMessage);
    });

    it("an unpaid order cannot be given a tracking token", async () => {
      const unpaid = await placeOrder();
      const res = await ensureTrackingTokenForOrder(unpaid.id);
      expect(res).toEqual({ created: false, token: null });
      expect(
        await prisma.trackingToken.count({ where: { orderId: unpaid.id } }),
      ).toBe(0);
    });

    it("a revoked token returns the generic not-found", async () => {
      const order = await makePaidOrder();
      const token = await issueToken(order.id);
      await loginAs(prisma, "PK");
      await revokeTrackingToken({ orderId: order.id });
      logout();
      await expect(getPublicTrackingByToken(token)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("an expired token returns the generic not-found", async () => {
      const order = await makePaidOrder();
      const token = await issueToken(order.id);
      await prisma.trackingToken.update({
        where: { orderId: order.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await expect(getPublicTrackingByToken(token)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  // -------------------------------------------------------------------------
  // Live status timeline
  // -------------------------------------------------------------------------

  describe("status timeline (authoritative)", () => {
    it("reflects PAID → PACKED → PARCEL_BOOKED as the order progresses", async () => {
      const order = await makePaidOrder();
      const token = await issueToken(order.id);

      let dto = await getPublicTrackingByToken(token);
      expect(dto.stages.find((s) => s.key === "PAYMENT")?.state).toBe(
        "complete",
      );
      expect(dto.stages.find((s) => s.key === "PACKED")?.state).toBe("current");
      expect(dto.packedAt).toBeNull();

      await loginAs(prisma, "PK");
      await markOrderPacked({ orderId: order.id });
      logout();
      dto = await getPublicTrackingByToken(token);
      expect(dto.status).toBe("PACKED");
      expect(dto.packedAt).not.toBeNull();
      expect(dto.stages.find((s) => s.key === "PACKED")?.state).toBe(
        "complete",
      );

      await loginAs(prisma, "PK");
      await confirmParcelBooked({
        orderId: order.id,
        courierName: "Professional Couriers",
        lrNumber: "TN-2026/1188",
        bookingDate: new Date().toISOString().slice(0, 10),
        parcelCount: "3",
        remarks: "internal only note",
      });
      logout();
      dto = await getPublicTrackingByToken(token);
      expect(dto.status).toBe("PARCEL_BOOKED");
      expect(dto.courierName).toBe("Professional Couriers");
      expect(dto.lrNumber).toBe("TN-2026/1188");
      expect(dto.parcelCount).toBe(3);
      expect(dto.parcelBookedAt).not.toBeNull();
      expect(dto.stages.find((s) => s.key === "PARCEL_BOOKED")?.state).toBe(
        "complete",
      );
      // Internal booking remark must never surface.
      expect(JSON.stringify(dto)).not.toContain("internal only note");
    });

    it("later stages show as pending until reached", async () => {
      const order = await makePaidOrder();
      const dto = await getPublicTrackingByToken(await issueToken(order.id));
      expect(dto.stages.find((s) => s.key === "PARCEL_BOOKED")?.state).toBe(
        "pending",
      );
      expect(dto.stages.find((s) => s.key === "LR_AVAILABLE")?.state).toBe(
        "pending",
      );
      expect(dto.stages.find((s) => s.key === "REVIEW")?.state).toBe("pending");
    });

    it("duplicate PAID history events do not break the timeline", async () => {
      const order = await makePaidOrder();
      const token = await issueToken(order.id);
      const original = await prisma.orderStatusHistory.findFirstOrThrow({
        where: { orderId: order.id, toStatus: "PAID" },
      });
      await prisma.orderStatusHistory.create({
        data: {
          orderId: order.id,
          toStatus: "PAID",
          reason: "duplicate event",
        },
      });
      const dto = await getPublicTrackingByToken(token);
      expect(dto.paymentAt).toBe(original.createdAt.toISOString());
    });

    it("a cancelled order is shown safely", async () => {
      const order = await makePaidOrder();
      const token = await issueToken(order.id);
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "CANCELLED" },
      });
      await prisma.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: "PAID",
          toStatus: "CANCELLED",
          reason: "customer request",
        },
      });
      const dto = await getPublicTrackingByToken(token);
      expect(dto.cancelled).toBe(true);
      expect(dto.status).toBe("CANCELLED");
      expect(dto.destination).toBeNull();
      expect(dto.courierName).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // LR document access
  // -------------------------------------------------------------------------

  describe("LR copy via tracking token", () => {
    it("is unavailable before an LR PDF is uploaded", async () => {
      const order = await makePaidOrder();
      const token = await issueToken(order.id);
      const dto = await getPublicTrackingByToken(token);
      expect(dto.lrAvailable).toBe(false);
      await expect(getPublicTrackingLrByToken(token)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("becomes available after a valid upload", async () => {
      const order = await makePaidOrder();
      const token = await issueToken(order.id);
      await loginAs(prisma, "PK");
      await markOrderPacked({ orderId: order.id });
      await uploadLrDocument({ orderId: order.id }, PDF, "lr.pdf");
      logout();

      const dto = await getPublicTrackingByToken(token);
      expect(dto.lrAvailable).toBe(true);
      const { data, filename } = await getPublicTrackingLrByToken(token);
      expect(data.length).toBe(PDF.length);
      expect(filename).toMatch(/^LR-QC-[0-9A-F]{8}\.pdf$/);
    });

    it("one order's token cannot fetch another order's LR", async () => {
      const orderA = await makePaidOrder();
      const orderB = await makePaidOrder();
      const tokenA = await issueToken(orderA.id);

      await loginAs(prisma, "PK");
      await markOrderPacked({ orderId: orderB.id });
      await uploadLrDocument({ orderId: orderB.id }, PDF, "b.pdf");
      logout();

      // A has no LR of its own → generic not-found, never B's bytes.
      await expect(getPublicTrackingLrByToken(tokenA)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  // -------------------------------------------------------------------------
  // Privacy of the public DTO
  // -------------------------------------------------------------------------

  describe("public DTO privacy", () => {
    it("never returns the customer address, phone, name, or email", async () => {
      const order = await makePaidOrder();
      const dto = await getPublicTrackingByToken(await issueToken(order.id));
      const json = JSON.stringify(dto);
      for (const secret of [
        CUSTOMER.addressLine1,
        CUSTOMER.addressLine2,
        CUSTOMER.pincode,
        CUSTOMER.phone,
        CUSTOMER.name,
        CUSTOMER.email,
      ]) {
        expect(json).not.toContain(secret);
      }
      expect(dto).not.toHaveProperty("customerName");
      expect(dto).not.toHaveProperty("customerPhone");
      expect(dto).not.toHaveProperty("addressLine1");
    });

    it("never returns payment secrets", async () => {
      const order = await placeOrder();
      const utr = "PAYSECRET99887766";
      await submitPayment(order.reference, { upiReference: utr });
      const payment = await prisma.payment.findFirstOrThrow({
        where: { orderId: order.id },
      });
      await loginAs(prisma, "PK");
      await verifyPayment({ paymentId: payment.id, action: "verify" });
      logout();

      const dto = await getPublicTrackingByToken(await issueToken(order.id));
      const json = JSON.stringify(dto);
      expect(json).not.toContain(utr);
      expect(dto).not.toHaveProperty("upiReference");
      expect(dto).not.toHaveProperty("payeeVpa");
      expect(dto).not.toHaveProperty("totalPaise");
    });

    it("never exposes raw database identifiers", async () => {
      const order = await makePaidOrder();
      const dto = await getPublicTrackingByToken(await issueToken(order.id));
      const json = JSON.stringify(dto);
      expect(json).not.toContain(order.id);
      expect(json).not.toContain(order.reference);
      expect(order.customerId).toBeTruthy();
      expect(json).not.toContain(order.customerId);
      expect(dto).not.toHaveProperty("id");
      expect(dto).not.toHaveProperty("orderId");
    });
  });

  // -------------------------------------------------------------------------
  // Rate limiting, no-login, RBAC, i18n
  // -------------------------------------------------------------------------

  describe("hardening", () => {
    it("rate-limits public tracking requests", async () => {
      const order = await makePaidOrder();
      const token = await issueToken(order.id);
      _resetRateLimits();
      let limited = false;
      for (let i = 0; i < 75; i++) {
        try {
          await getPublicTrackingByToken(token);
        } catch (e) {
          if ((e as { code?: string }).code === "RATE_LIMITED") {
            limited = true;
            break;
          }
          throw e;
        }
      }
      expect(limited).toBe(true);
    });

    it("works with no signed-in user (public, no login)", async () => {
      const order = await makePaidOrder();
      const token = await issueToken(order.id);
      logout();
      const dto = await getPublicTrackingByToken(token);
      expect(dto.status).toBe("PAID");
    });

    it("only tracking.manage may regenerate or revoke; orders.view may read status", async () => {
      const order = await makePaidOrder();

      await loginAs(prisma, "S1"); // staff: has orders.view, not tracking.manage
      await expect(
        regenerateTrackingToken({ orderId: order.id }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        revokeTrackingToken({ orderId: order.id }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      const info = await getTrackingAdminInfo(order.id);
      expect(info.eligible).toBe(true);
      logout();

      await loginAs(prisma, "PSR"); // partner
      const { token } = await regenerateTrackingToken({ orderId: order.id });
      expect(token).toMatch(TOKEN_RE);
      logout();
    });

    it("ships Tamil and English tracking strings", () => {
      const en = getDictionary("en").tracking;
      const ta = getDictionary("ta").tracking;
      expect(en.stagePayment.length).toBeGreaterThan(0);
      expect(ta.stagePayment.length).toBeGreaterThan(0);
      expect(en.invalidTitle).not.toBe(ta.invalidTitle);
      expect(Object.keys(en).sort()).toEqual(Object.keys(ta).sort());
    });
  });
});
