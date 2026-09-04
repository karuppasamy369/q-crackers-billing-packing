/**
 * Phase 6 integration tests — booking panel: packing, courier / LR entry,
 * PARCEL_BOOKED transition, LR PDF upload, and RBAC.
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
  listBookingOrders,
  getBookingForConsole,
  markOrderPacked,
  confirmParcelBooked,
  updateBookingDetails,
  uploadLrDocument,
  getLrDocumentBytes,
} from "@/server/services/booking-service";

const d = TEST_DB ? describe : describe.skip;

const CUSTOMER = {
  name: "Track Buyer",
  phone: "9876500011",
  addressLine1: "9 Courier Road",
  city: "Sivakasi",
  stateCode: "33",
  pincode: "626123",
};

const PDF = new TextEncoder().encode(
  "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n",
);
const NOT_PDF = new TextEncoder().encode("this is definitely not a pdf file");

let seq = 0;

async function makeProduct(stock: number) {
  seq += 1;
  const sku = `BK-${seq}`;
  const category = await prisma.category.upsert({
    where: { slug: "bk-cat" },
    update: {},
    create: { name: "Bk Cat", slug: "bk-cat", isActive: true },
  });
  return prisma.product.create({
    data: {
      sku,
      slug: sku.toLowerCase(),
      name: sku,
      categoryId: category.id,
      pricePaise: 30000,
      gstRateBp: 1800,
      isActive: true,
      isVisibleOnline: true,
      inventory: { create: { quantityOnHand: stock } },
    },
  });
}

/** Place an order and take it all the way to PAID via the real payment flow. */
async function makePaidOrder(qty = 1) {
  const p = await makeProduct(20);
  logout();
  const { reference } = await createOnlineOrder(
    { items: [{ slug: p.slug, quantity: qty }], customer: CUSTOMER },
    { partnerCode: "psr" },
  );
  await submitPayment(reference, {
    upiReference: `BOOK${seq}${Date.now()}`.slice(0, 34),
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

const goodParcel = (orderId: string) => ({
  orderId,
  courierName: "Professional Couriers",
  lrNumber: "TN-2026/0042",
  bookingDate: new Date().toISOString().slice(0, 10),
  parcelCount: "2",
  remarks: "Handle with care",
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

d("Phase 6 — booking", () => {
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

  describe("queue", () => {
    it("a paid order automatically appears in the booking panel", async () => {
      const { order } = await makePaidOrder();
      await loginAs(prisma, "S1");
      const list = await listBookingOrders({});
      logout();
      expect(list.rows.some((r) => r.id === order.id)).toBe(true);
    });

    it("an unpaid order does NOT appear in the booking panel", async () => {
      const p = await makeProduct(10);
      logout();
      const { reference } = await createOnlineOrder(
        { items: [{ slug: p.slug, quantity: 1 }], customer: CUSTOMER },
        {},
      );
      await loginAs(prisma, "PK");
      const list = await listBookingOrders({});
      logout();
      expect(list.rows.some((r) => r.reference === reference)).toBe(false);
    });
  });

  describe("mark packed", () => {
    it("PAID → PACKED, creates the booking record, writes history + audit", async () => {
      const { order } = await makePaidOrder();
      await loginAs(prisma, "S1");
      await markOrderPacked({ orderId: order.id });
      logout();

      const fresh = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        include: { booking: true },
      });
      expect(fresh.status).toBe("PACKED");
      expect(fresh.booking?.packedAt).not.toBeNull();
      expect(fresh.booking?.packedById).not.toBeNull();

      const hist = await prisma.orderStatusHistory.findFirst({
        where: { orderId: order.id, toStatus: "PACKED" },
      });
      expect(hist?.fromStatus).toBe("PAID");

      const audit = await prisma.auditLog.findFirst({
        where: { action: "booking.pack", entityId: order.id },
      });
      expect(audit).not.toBeNull();
    });

    it("cannot pack an order that is still AWAITING_PAYMENT (invalid transition)", async () => {
      const p = await makeProduct(10);
      logout();
      const { reference } = await createOnlineOrder(
        { items: [{ slug: p.slug, quantity: 1 }], customer: CUSTOMER },
        {},
      );
      const order = await prisma.order.findUniqueOrThrow({
        where: { reference },
      });
      await loginAs(prisma, "PK");
      await expect(
        markOrderPacked({ orderId: order.id }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      logout();
      const fresh = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
      });
      expect(fresh.status).toBe("AWAITING_PAYMENT");
    });

    it("cannot pack an order that is already packed", async () => {
      const { order } = await makePaidOrder();
      await loginAs(prisma, "PK");
      await markOrderPacked({ orderId: order.id });
      await expect(
        markOrderPacked({ orderId: order.id }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
      logout();
    });
  });

  describe("confirm parcel booked", () => {
    it("requires all four courier / LR fields — order stays PACKED on a bad payload", async () => {
      const { order } = await makePaidOrder();
      await loginAs(prisma, "PK");
      await markOrderPacked({ orderId: order.id });

      await expect(
        confirmParcelBooked({
          orderId: order.id,
          courierName: "",
          lrNumber: "",
          bookingDate: "",
          parcelCount: "",
          remarks: "",
        }),
      ).rejects.toBeTruthy();

      await expect(
        confirmParcelBooked({
          ...goodParcel(order.id),
          lrNumber: "",
        }),
      ).rejects.toBeTruthy();
      logout();

      const fresh = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
      });
      expect(fresh.status).toBe("PACKED");
    });

    it("PACKED → PARCEL_BOOKED with valid details, persisted + history + audit", async () => {
      const { order } = await makePaidOrder();
      await loginAs(prisma, "PK");
      await markOrderPacked({ orderId: order.id });
      await confirmParcelBooked(goodParcel(order.id));
      logout();

      const fresh = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        include: { booking: true },
      });
      expect(fresh.status).toBe("PARCEL_BOOKED");
      expect(fresh.booking?.courierName).toBe("Professional Couriers");
      expect(fresh.booking?.lrNumber).toBe("TN-2026/0042");
      expect(fresh.booking?.parcelCount).toBe(2);
      expect(fresh.booking?.parcelBookedAt).not.toBeNull();

      const hist = await prisma.orderStatusHistory.findFirst({
        where: { orderId: order.id, toStatus: "PARCEL_BOOKED" },
      });
      expect(hist?.fromStatus).toBe("PACKED");

      const audit = await prisma.auditLog.findFirst({
        where: { action: "booking.book_parcel", entityId: order.id },
      });
      expect(audit).not.toBeNull();
    });

    it("cannot confirm PARCEL_BOOKED directly from PAID (must pack first)", async () => {
      const { order } = await makePaidOrder();
      await loginAs(prisma, "PK");
      await expect(
        confirmParcelBooked(goodParcel(order.id)),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      logout();
      const fresh = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
      });
      expect(fresh.status).toBe("PAID");
    });

    it("edit booking details after booking (no status change), audited", async () => {
      const { order } = await makePaidOrder();
      await loginAs(prisma, "PK");
      await markOrderPacked({ orderId: order.id });
      await confirmParcelBooked(goodParcel(order.id));
      await updateBookingDetails({
        ...goodParcel(order.id),
        courierName: "DTDC",
        parcelCount: "5",
      });
      logout();

      const fresh = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        include: { booking: true },
      });
      expect(fresh.status).toBe("PARCEL_BOOKED");
      expect(fresh.booking?.courierName).toBe("DTDC");
      expect(fresh.booking?.parcelCount).toBe(5);

      const audit = await prisma.auditLog.findFirst({
        where: { action: "booking.update", entityId: order.id },
      });
      expect(audit).not.toBeNull();
    });
  });

  describe("LR document", () => {
    it("rejects a non-PDF upload", async () => {
      const { order } = await makePaidOrder();
      await loginAs(prisma, "PK");
      await markOrderPacked({ orderId: order.id });
      await expect(
        uploadLrDocument({ orderId: order.id }, NOT_PDF, "fake.pdf"),
      ).rejects.toMatchObject({ code: "VALIDATION" });
      logout();
    });

    it("rejects an upload before the order is packed", async () => {
      const { order } = await makePaidOrder();
      await loginAs(prisma, "PK");
      await expect(
        uploadLrDocument({ orderId: order.id }, PDF, "lr.pdf"),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      logout();
    });

    it("accepts a valid PDF once packed; re-upload supersedes the previous one", async () => {
      const { order } = await makePaidOrder();
      await loginAs(prisma, "PK");
      await markOrderPacked({ orderId: order.id });
      await uploadLrDocument({ orderId: order.id }, PDF, "first.pdf");
      await uploadLrDocument({ orderId: order.id }, PDF, "second.pdf");
      logout();

      const docs = await prisma.lrDocument.findMany({
        where: { orderId: order.id },
        orderBy: { uploadedAt: "asc" },
      });
      expect(docs).toHaveLength(2);
      expect(docs.filter((x) => x.isCurrent)).toHaveLength(1);
      expect(docs.find((x) => x.isCurrent)?.originalFilename).toBe(
        "second.pdf",
      );
      expect(docs[0]!.isCurrent).toBe(false);
      expect(docs[0]!.supersededAt).not.toBeNull();

      const audit = await prisma.auditLog.count({
        where: { action: "lr.upload", entityId: order.id },
      });
      expect(audit).toBe(2);
    });

    it("console download returns bytes and is audited", async () => {
      const { order } = await makePaidOrder();
      await loginAs(prisma, "PK");
      await markOrderPacked({ orderId: order.id });
      await uploadLrDocument({ orderId: order.id }, PDF, "lr.pdf");
      const { data, filename } = await getLrDocumentBytes({
        orderId: order.id,
      });
      logout();
      expect(data.length).toBe(PDF.length);
      expect(filename).toMatch(/\.pdf$/);

      const audit = await prisma.auditLog.findFirst({
        where: { action: "lr.download", entityId: order.id },
      });
      expect(audit).not.toBeNull();
    });
  });

  // The public customer tracking view + LR copy are covered end-to-end in
  // tests/integration/tracking.integration.test.ts (Phase 7).

  describe("RBAC (server-side)", () => {
    it("staff denied booking.view cannot list or open the panel", async () => {
      const { order } = await makePaidOrder();
      await denyPermission("S1", "booking.view");
      await loginAs(prisma, "S1");
      await expect(listBookingOrders({})).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(
        getBookingForConsole({ orderId: order.id }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      logout();
    });

    it("staff denied booking.pack cannot mark packed", async () => {
      const { order } = await makePaidOrder();
      await denyPermission("S1", "booking.pack");
      await loginAs(prisma, "S1");
      await expect(
        markOrderPacked({ orderId: order.id }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      logout();
    });

    it("staff denied booking.book_parcel cannot confirm the parcel", async () => {
      const { order } = await makePaidOrder();
      await loginAs(prisma, "PK");
      await markOrderPacked({ orderId: order.id });
      logout();
      await denyPermission("S1", "booking.book_parcel");
      await loginAs(prisma, "S1");
      await expect(
        confirmParcelBooked(goodParcel(order.id)),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      logout();
    });

    it("staff denied lr.upload / lr.download are refused", async () => {
      const { order } = await makePaidOrder();
      await loginAs(prisma, "PK");
      await markOrderPacked({ orderId: order.id });
      await uploadLrDocument({ orderId: order.id }, PDF, "lr.pdf");
      logout();

      await denyPermission("S1", "lr.upload");
      await denyPermission("S1", "lr.download");
      await loginAs(prisma, "S1");
      await expect(
        uploadLrDocument({ orderId: order.id }, PDF, "lr.pdf"),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        getLrDocumentBytes({ orderId: order.id }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      logout();
    });

    it("a partner keeps every booking permission (DENY is ignored for partners)", async () => {
      const { order } = await makePaidOrder();
      await denyPermission("PSR", "booking.pack");
      await loginAs(prisma, "PSR");
      await markOrderPacked({ orderId: order.id });
      logout();
      const fresh = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
      });
      expect(fresh.status).toBe("PACKED");
    });
  });
});
