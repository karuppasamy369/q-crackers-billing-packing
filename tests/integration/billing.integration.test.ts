/**
 * Phase 4 integration tests — bill numbering, GST, stock, permissions.
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
import { indianFiscalYear } from "@/lib/fiscal-year";
import {
  createCounterBill,
  cancelBill,
  issueBillForOrder,
  getBillPdfBytes,
  listBills,
} from "@/server/services/billing-service";
import { formatBillNumber } from "@/lib/bill-number";
import { updateSettings } from "@/server/services/settings-service";
import { createOnlineOrder } from "@/server/services/orders-service";

const d = TEST_DB ? describe : describe.skip;
const FY = indianFiscalYear();

async function makeProduct(sku: string, pricePaise: number, stock: number) {
  const category = await prisma.category.upsert({
    where: { slug: "bill-cat" },
    update: {},
    create: { name: "Bill Cat", slug: "bill-cat", isActive: true },
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

const CUSTOMER = { name: "Walk-in Buyer", stateCode: "33" };

d("Phase 4 — billing", () => {
  beforeEach(async () => {
    await resetCatalogue(prisma);
    logout();
    await loginAs(prisma, "PK");
    await updateSettings({
      "tax.pricesIncludeGst": false,
      "business.stateCode": "33",
      "business.legalName": "Q Crackers Test",
      "billing.housePartnerCode": "PK",
    });
    logout();
  });

  describe("bill numbering", () => {
    it("uses the agreed format and an independent sequence per code", async () => {
      const p = await makeProduct("BN-1", 10000, 100);
      const line = [{ productId: p.id, quantity: 1 }];

      await loginAs(prisma, "PK");
      const b1 = await createCounterBill({
        customer: CUSTOMER,
        items: line,
        paymentMode: "CASH",
      });
      const b2 = await createCounterBill({
        customer: CUSTOMER,
        items: line,
        paymentMode: "CASH",
      });
      logout();

      await loginAs(prisma, "KA");
      const k1 = await createCounterBill({
        customer: CUSTOMER,
        items: line,
        paymentMode: "UPI",
      });
      logout();

      await loginAs(prisma, "S1");
      const s1 = await createCounterBill({
        customer: CUSTOMER,
        items: line,
        paymentMode: "CASH",
      });
      logout();

      expect(b1.billNumber).toBe(`PK-${FY}-0001`);
      expect(b2.billNumber).toBe(`PK-${FY}-0002`);
      expect(k1.billNumber).toBe(`KA-${FY}-0001`);
      expect(s1.billNumber).toBe(`S1-${FY}-0001`);
      expect(b1.userCode).toBe("PK");
      expect(b1.sequenceNo).toBe(1);
    });

    it("counter bills issued back-to-back get consecutive numbers", async () => {
      const p = await makeProduct("BN-C", 5000, 50);
      await loginAs(prisma, "PSR");
      const nums: string[] = [];
      for (let i = 0; i < 4; i++) {
        const b = await createCounterBill({
          customer: CUSTOMER,
          items: [{ productId: p.id, quantity: 1 }],
          paymentMode: "CASH",
        });
        nums.push(b.billNumber);
      }
      logout();
      expect(nums).toEqual([
        formatBillNumber("PSR", FY, 1),
        formatBillNumber("PSR", FY, 2),
        formatBillNumber("PSR", FY, 3),
        formatBillNumber("PSR", FY, 4),
      ]);
    });

    it("a cancelled bill keeps its number; the next bill does not reuse it", async () => {
      const p = await makeProduct("BN-X", 10000, 100);
      const line = [{ productId: p.id, quantity: 1 }];

      await loginAs(prisma, "PK");
      const b1 = await createCounterBill({
        customer: CUSTOMER,
        items: line,
        paymentMode: "CASH",
      });
      const b2 = await createCounterBill({
        customer: CUSTOMER,
        items: line,
        paymentMode: "CASH",
      });
      logout();

      await loginAs(prisma, "PK"); // billing.cancel
      const cancelled = await cancelBill({
        id: b1.id,
        reason: "Entered wrong item",
      });
      const b3 = await createCounterBill({
        customer: CUSTOMER,
        items: line,
        paymentMode: "CASH",
      });
      logout();

      expect(cancelled.billNumber).toBe(b1.billNumber);
      expect(cancelled.status).toBe("CANCELLED");
      expect(b2.billNumber).toBe(`PK-${FY}-0002`);
      expect(b3.billNumber).toBe(`PK-${FY}-0003`);
    });
  });

  describe("counter bill stock effects", () => {
    it("decrements stock with a SALE movement; cancel restores it with a RETURN", async () => {
      const p = await makeProduct("ST-1", 10000, 10);
      await loginAs(prisma, "PK");

      const bill = await createCounterBill({
        customer: CUSTOMER,
        items: [{ productId: p.id, quantity: 3 }],
        paymentMode: "CASH",
      });

      let inv = await prisma.inventory.findUniqueOrThrow({
        where: { productId: p.id },
      });
      expect(inv.quantityOnHand).toBe(7);
      const sale = await prisma.inventoryMovement.findFirstOrThrow({
        where: { productId: p.id, reason: "SALE" },
      });
      expect(sale.changeQty).toBe(-3);
      expect(sale.balanceAfter).toBe(7);
      expect(sale.refId).toBe(bill.id);

      await cancelBill({ id: bill.id, reason: "Customer changed mind" });
      inv = await prisma.inventory.findUniqueOrThrow({
        where: { productId: p.id },
      });
      expect(inv.quantityOnHand).toBe(10);
      const ret = await prisma.inventoryMovement.findFirstOrThrow({
        where: { productId: p.id, reason: "RETURN" },
      });
      expect(ret.changeQty).toBe(3);
      logout();
    });

    it("rejects billing more than the available stock", async () => {
      const p = await makeProduct("ST-2", 10000, 2);
      await loginAs(prisma, "PK");
      await expect(
        createCounterBill({
          customer: CUSTOMER,
          items: [{ productId: p.id, quantity: 5 }],
          paymentMode: "CASH",
        }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
      expect(await prisma.bill.count()).toBe(0);
      logout();
    });
  });

  describe("GST split", () => {
    it("intra-state uses CGST+SGST, inter-state uses IGST", async () => {
      const p = await makeProduct("GST-1", 10000, 100);
      const items = [{ productId: p.id, quantity: 1 }];

      await loginAs(prisma, "PK");
      const intra = await createCounterBill({
        customer: { name: "TN Buyer", stateCode: "33" },
        items,
        paymentMode: "CASH",
      });
      const inter = await createCounterBill({
        customer: { name: "KA Buyer", stateCode: "29" },
        items,
        paymentMode: "CASH",
      });
      logout();

      expect(intra.intraState).toBe(true);
      expect(intra.igstPaise).toBe(0);
      expect(intra.cgstPaise + intra.sgstPaise).toBe(1800);

      expect(inter.intraState).toBe(false);
      expect(inter.cgstPaise).toBe(0);
      expect(inter.sgstPaise).toBe(0);
      expect(inter.igstPaise).toBe(1800);
    });
  });

  describe("online-order bills", () => {
    async function makePaidOrder(productId: string) {
      const { reference } = await createOnlineOrder({
        items: [
          {
            slug: (
              await prisma.product.findUniqueOrThrow({
                where: { id: productId },
              })
            ).slug,
            quantity: 1,
          },
        ],
        customer: {
          name: "Online Buyer",
          phone: "9876543210",
          addressLine1: "1 Road",
          city: "Chennai",
          stateCode: "33",
          pincode: "600001",
        },
      });
      const order = await prisma.order.update({
        where: { reference },
        data: { status: "PAID", paymentStatus: "PAID" },
      });
      return order;
    }

    it("issues one bill under the house partner code; a second call is idempotent", async () => {
      const p = await makeProduct("OO-1", 20000, 50);
      const order = await makePaidOrder(p.id);

      await loginAs(prisma, "PK");
      const bill = await issueBillForOrder({ orderId: order.id });
      const again = await issueBillForOrder({ orderId: order.id });
      logout();

      expect(bill.userCode).toBe("PK");
      expect(bill.type).toBe("ONLINE_ORDER");
      expect(bill.orderId).toBe(order.id);
      expect(bill.totalPaise).toBe(order.totalPaise);
      expect(again.id).toBe(bill.id);
      expect(await prisma.bill.count({ where: { orderId: order.id } })).toBe(1);
    });

    it("refuses to bill an order whose payment is not confirmed", async () => {
      const p = await makeProduct("OO-2", 20000, 50);
      const { reference } = await createOnlineOrder({
        items: [{ slug: p.slug, quantity: 1 }],
        customer: {
          name: "Unpaid Buyer",
          phone: "9876543211",
          addressLine1: "1 Road",
          city: "Chennai",
          stateCode: "33",
          pincode: "600001",
        },
      });
      const order = await prisma.order.findUniqueOrThrow({
        where: { reference },
      });

      await loginAs(prisma, "PK");
      await expect(
        issueBillForOrder({ orderId: order.id }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
      logout();
      expect(await prisma.bill.count()).toBe(0);
    });
  });

  describe("permissions", () => {
    it("staff can create a bill but cannot cancel one", async () => {
      const p = await makeProduct("PERM-1", 10000, 100);
      await loginAs(prisma, "S1");
      const bill = await createCounterBill({
        customer: CUSTOMER,
        items: [{ productId: p.id, quantity: 1 }],
        paymentMode: "CASH",
      });
      expect(bill.billNumber).toBe(`S1-${FY}-0001`);

      await expect(
        cancelBill({ id: bill.id, reason: "nope" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      logout();
    });

    it("an anonymous caller cannot list bills", async () => {
      logout();
      await expect(listBills({})).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
      });
    });
  });

  describe("PDF", () => {
    it("produces a real PDF for a bill", async () => {
      const p = await makeProduct("PDF-1", 10000, 100);
      await loginAs(prisma, "PK");
      const bill = await createCounterBill({
        customer: CUSTOMER,
        items: [{ productId: p.id, quantity: 2 }],
        paymentMode: "CASH",
      });
      const { data, filename } = await getBillPdfBytes({ id: bill.id });
      logout();

      expect(filename).toBe(`${bill.billNumber}.pdf`);
      expect(Buffer.from(data.slice(0, 4)).toString()).toBe("%PDF");
    });
  });

  // Kept last: this fires many concurrent DB requests at once. A real
  // PostgreSQL serialises them via the ON CONFLICT row lock; the in-process
  // PGlite used for local dev cannot sustain that load, so this assertion is
  // really verified in CI (which runs against PostgreSQL 16).
  describe("concurrency", () => {
    it("allocates gap-free, unique bill numbers under concurrent requests", async () => {
      const N = 40;
      const results = await Promise.all(
        Array.from(
          { length: N },
          () =>
            prisma.$queryRaw<{ lastNumber: number }[]>`
            INSERT INTO "bill_sequences" ("userCode", "fiscalYear", "lastNumber", "updatedAt", "createdAt")
            VALUES ('PSR', ${FY}, 1, now(), now())
            ON CONFLICT ("userCode", "fiscalYear")
            DO UPDATE SET "lastNumber" = "bill_sequences"."lastNumber" + 1, "updatedAt" = now()
            RETURNING "lastNumber"`,
        ),
      );

      const seqs = results.map((r) => r[0]!.lastNumber).sort((a, b) => a - b);
      expect(seqs).toEqual(Array.from({ length: N }, (_, i) => i + 1));
      expect(new Set(seqs).size).toBe(N);

      const seq = await prisma.billSequence.findUniqueOrThrow({
        where: { userCode_fiscalYear: { userCode: "PSR", fiscalYear: FY } },
      });
      expect(seq.lastNumber).toBe(N);
    });
  });
});
