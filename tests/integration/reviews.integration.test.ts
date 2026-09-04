/**
 * Phase 9 integration tests — customer reviews + the COMPLETED transition.
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
  markOrderPacked,
  confirmParcelBooked,
  uploadLrDocument,
  markOrderCompleted,
} from "@/server/services/booking-service";
import {
  ensureTrackingTokenForOrder,
  revokeTrackingToken,
  getPublicTrackingByToken,
} from "@/server/services/tracking-service";
import {
  submitReview,
  listReviews,
  moderateReview,
  getReviewStats,
} from "@/server/services/reviews-service";

const d = TEST_DB ? describe : describe.skip;

const CUSTOMER = {
  name: "Meera Sundaram",
  phone: "9876543000",
  email: "meera@example.com",
  addressLine1: "8 Sparkler Lane",
  city: "Sivakasi",
  stateCode: "33",
  pincode: "626123",
};

const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF\n");
let seq = 0;

async function makeProduct() {
  seq += 1;
  const sku = `REV-${seq}`;
  const category = await prisma.category.upsert({
    where: { slug: "rev-cat" },
    update: {},
    create: { name: "Rev Cat", slug: "rev-cat", isActive: true },
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
    upiReference: `REV${seq}${Date.now()}`.toUpperCase().slice(0, 30),
  });
  const payment = await prisma.payment.findFirstOrThrow({
    where: { orderId: order.id },
  });
  await loginAs(prisma, "PK");
  await verifyPayment({ paymentId: payment.id, action: "verify" });
  logout();
  return prisma.order.findUniqueOrThrow({ where: { id: order.id } });
}

async function bookParcel(orderId: string) {
  await loginAs(prisma, "PK");
  await markOrderPacked({ orderId });
  await confirmParcelBooked({
    orderId,
    courierName: "Professional Couriers",
    lrNumber: "TN-2026/9001",
    bookingDate: new Date().toISOString().slice(0, 10),
    parcelCount: "1",
    remarks: "",
  });
  logout();
}

async function tokenFor(orderId: string) {
  const res = await ensureTrackingTokenForOrder(orderId);
  return res.token ?? "";
}

d("Phase 9 — customer reviews", () => {
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

  describe("eligibility", () => {
    it("cannot review before the parcel is dispatched", async () => {
      const order = await makePaidOrder();
      const token = await tokenFor(order.id);
      await expect(
        submitReview({ token, rating: 5, comment: "" }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("can review once PARCEL_BOOKED — row + audit created", async () => {
      const order = await makePaidOrder();
      await bookParcel(order.id);
      const token = await tokenFor(order.id);

      const res = await submitReview({
        token,
        rating: 4,
        comment: "Fast delivery, good packing.",
      });
      expect(res.status).toBe("submitted");

      const review = await prisma.review.findUniqueOrThrow({
        where: { orderId: order.id },
      });
      expect(review.rating).toBe(4);
      expect(review.comment).toBe("Fast delivery, good packing.");
      expect(review.reviewerName).toBe("Meera");
      expect(review.status).toBe("PUBLISHED");
      expect(review.customerId).toBe(order.customerId);

      const audit = await prisma.auditLog.findFirst({
        where: { action: "review.submit", entityId: review.id },
      });
      expect(audit).not.toBeNull();
    });

    it("can review a COMPLETED order too", async () => {
      const order = await makePaidOrder();
      await bookParcel(order.id);
      await loginAs(prisma, "PK");
      await uploadLrDocument({ orderId: order.id }, PDF, "lr.pdf");
      await markOrderCompleted({ orderId: order.id });
      logout();

      const token = await tokenFor(order.id);
      const res = await submitReview({ token, rating: 5, comment: "" });
      expect(res.status).toBe("submitted");
    });
  });

  describe("duplicate prevention", () => {
    it("a second submission is a no-op — one review per order", async () => {
      const order = await makePaidOrder();
      await bookParcel(order.id);
      const token = await tokenFor(order.id);

      await submitReview({ token, rating: 5, comment: "First" });
      const second = await submitReview({
        token,
        rating: 1,
        comment: "Second",
      });
      expect(second.status).toBe("already_reviewed");

      const count = await prisma.review.count({
        where: { orderId: order.id },
      });
      expect(count).toBe(1);
      const review = await prisma.review.findUniqueOrThrow({
        where: { orderId: order.id },
      });
      expect(review.rating).toBe(5); // unchanged
    });
  });

  describe("token security", () => {
    it("an invalid token gives a generic not-found", async () => {
      await expect(
        submitReview({ token: "z".repeat(43), rating: 5, comment: "" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("a revoked token cannot submit a review", async () => {
      const order = await makePaidOrder();
      await bookParcel(order.id);
      const token = await tokenFor(order.id);
      await loginAs(prisma, "PK");
      await revokeTrackingToken({ orderId: order.id });
      logout();
      await expect(
        submitReview({ token, rating: 5, comment: "" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("rejects an out-of-range rating", async () => {
      const order = await makePaidOrder();
      await bookParcel(order.id);
      const token = await tokenFor(order.id);
      await expect(
        submitReview({ token, rating: 9, comment: "" }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
    });
  });

  describe("tracking page reflects the review", () => {
    it("shows the review and closes the review stage", async () => {
      const order = await makePaidOrder();
      await bookParcel(order.id);
      const token = await tokenFor(order.id);

      let dto = await getPublicTrackingByToken(token);
      expect(dto.canReview).toBe(true);
      expect(dto.review).toBeNull();

      await submitReview({ token, rating: 5, comment: "Loved it" });

      dto = await getPublicTrackingByToken(token);
      expect(dto.canReview).toBe(false);
      expect(dto.review).toEqual({ rating: 5, comment: "Loved it" });
      expect(dto.stages.find((s) => s.key === "REVIEW")?.state).toBe(
        "complete",
      );
    });
  });

  describe("partner moderation (RBAC)", () => {
    async function seededReview() {
      const order = await makePaidOrder();
      await bookParcel(order.id);
      const token = await tokenFor(order.id);
      await submitReview({ token, rating: 2, comment: "Late delivery" });
      return prisma.review.findUniqueOrThrow({ where: { orderId: order.id } });
    }

    it("staff without reviews.moderate are refused", async () => {
      const review = await seededReview();
      await loginAs(prisma, "S1");
      await expect(listReviews({})).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(
        moderateReview({ id: review.id, action: "hide" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(getReviewStats()).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      logout();
    });

    it("a partner can hide, re-publish and delete", async () => {
      const review = await seededReview();
      await loginAs(prisma, "PSR");

      await moderateReview({
        id: review.id,
        action: "hide",
        note: "off-topic",
      });
      let fresh = await prisma.review.findUniqueOrThrow({
        where: { id: review.id },
      });
      expect(fresh.status).toBe("HIDDEN");
      expect(fresh.moderatedById).not.toBeNull();

      await moderateReview({ id: review.id, action: "publish" });
      fresh = await prisma.review.findUniqueOrThrow({
        where: { id: review.id },
      });
      expect(fresh.status).toBe("PUBLISHED");

      await moderateReview({ id: review.id, action: "delete" });
      logout();
      expect(
        await prisma.review.findUnique({ where: { id: review.id } }),
      ).toBeNull();

      const audits = await prisma.auditLog.findMany({
        where: {
          action: { in: ["review.hide", "review.publish", "review.delete"] },
        },
      });
      expect(audits.length).toBeGreaterThanOrEqual(3);
    });

    it("the moderation list never exposes customer contact details", async () => {
      await seededReview();
      await loginAs(prisma, "PSR");
      const list = await listReviews({});
      const stats = await getReviewStats();
      logout();

      const json = JSON.stringify(list.rows);
      expect(json).not.toContain(CUSTOMER.phone);
      expect(json).not.toContain(CUSTOMER.email);
      expect(json).not.toContain(CUSTOMER.addressLine1);
      expect(json).not.toContain(CUSTOMER.pincode);
      // Given name only.
      expect(json).toContain("Meera");
      expect(json).not.toContain("Sundaram");
      expect(stats.total).toBeGreaterThan(0);
      expect(stats.average).not.toBeNull();
    });
  });

  describe("COMPLETED transition", () => {
    it("requires an LR document, then PARCEL_BOOKED → COMPLETED", async () => {
      const order = await makePaidOrder();
      await bookParcel(order.id);

      await loginAs(prisma, "PK");
      await expect(
        markOrderCompleted({ orderId: order.id }),
      ).rejects.toMatchObject({ code: "CONFLICT" });

      await uploadLrDocument({ orderId: order.id }, PDF, "lr.pdf");
      await markOrderCompleted({ orderId: order.id });
      logout();

      const fresh = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
      });
      expect(fresh.status).toBe("COMPLETED");

      const hist = await prisma.orderStatusHistory.findFirst({
        where: { orderId: order.id, toStatus: "COMPLETED" },
      });
      expect(hist?.fromStatus).toBe("PARCEL_BOOKED");

      const audit = await prisma.auditLog.findFirst({
        where: { action: "booking.complete", entityId: order.id },
      });
      expect(audit).not.toBeNull();
    });

    it("cannot complete an order that is only PAID", async () => {
      const order = await makePaidOrder();
      await loginAs(prisma, "PK");
      await expect(
        markOrderCompleted({ orderId: order.id }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      logout();
    });
  });
});
