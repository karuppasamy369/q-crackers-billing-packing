/**
 * Phase 3 integration tests — cart quote + order creation.
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
import { quoteCart } from "@/server/services/pricing-service";
import {
  createOnlineOrder,
  getOrderByReference,
  listOrders,
} from "@/server/services/orders-service";
import { updateSettings } from "@/server/services/settings-service";

const d = TEST_DB ? describe : describe.skip;

const CUSTOMER = {
  name: "Test Buyer",
  phone: "9876543210",
  addressLine1: "1 Test Street",
  city: "Sivakasi",
  stateCode: "33",
  pincode: "626123",
};

async function makeProduct(opts: {
  sku: string;
  slug: string;
  pricePaise: number;
  stock: number;
  online?: boolean;
  gstRateBp?: number;
}) {
  const category = await prisma.category.upsert({
    where: { slug: "test-cat" },
    update: {},
    create: { name: "Test Cat", slug: "test-cat", isActive: true },
  });
  const product = await prisma.product.create({
    data: {
      sku: opts.sku,
      slug: opts.slug,
      name: opts.sku,
      categoryId: category.id,
      pricePaise: opts.pricePaise,
      gstRateBp: opts.gstRateBp ?? 1800,
      isActive: true,
      isVisibleOnline: opts.online ?? true,
      inventory: { create: { quantityOnHand: opts.stock } },
    },
  });
  return product;
}

d("Phase 3 — cart quote & checkout", () => {
  beforeEach(async () => {
    await resetCatalogue(prisma);
    _resetRateLimits();
    logout();
    // GST-exclusive, flat ₹40 shipping, TN-only serviceable.
    await loginAs(prisma, "PK");
    await updateSettings({
      "tax.pricesIncludeGst": false,
      "shipping.mode": "flat",
      "shipping.flatPaise": 4000,
      "shipping.freeAbovePaise": 0,
      "fulfilment.serviceableStateCodes": ["33"],
      "fulfilment.blockedPincodes": ["626999"],
    });
    logout();
  });

  describe("quoteCart", () => {
    it("recalculates every amount from the database (client sends only slug + qty)", async () => {
      await makeProduct({
        sku: "Q-1",
        slug: "q-1",
        pricePaise: 10000,
        stock: 10,
      });

      const quote = await quoteCart([{ slug: "q-1", quantity: 3 }]);

      expect(quote.fulfillable).toBe(true);
      expect(quote.lines).toHaveLength(1);
      expect(quote.lines[0]!.unitPricePaise).toBe(10000);
      expect(quote.subtotalPaise).toBe(30000);
      expect(quote.taxPaise).toBe(5400); // 18%
      expect(quote.shippingPaise).toBe(4000);
      expect(quote.totalPaise).toBe(39400);
    });

    it("flags an out-of-stock line and is not fulfillable", async () => {
      await makeProduct({
        sku: "Q-2",
        slug: "q-2",
        pricePaise: 5000,
        stock: 2,
      });
      const quote = await quoteCart([{ slug: "q-2", quantity: 5 }]);
      expect(quote.fulfillable).toBe(false);
      expect(quote.issues[0]!.code).toBe("insufficient_stock");
      expect(quote.issues[0]!.available).toBe(2);
    });

    it("flags an offline product as unavailable", async () => {
      await makeProduct({
        sku: "Q-3",
        slug: "q-3",
        pricePaise: 5000,
        stock: 5,
        online: false,
      });
      const quote = await quoteCart([{ slug: "q-3", quantity: 1 }]);
      expect(quote.fulfillable).toBe(false);
      expect(quote.issues[0]!.code).toBe("unavailable");
    });
  });

  describe("createOnlineOrder", () => {
    it("creates the order + items + history atomically and reserves stock", async () => {
      const p = await makeProduct({
        sku: "O-1",
        slug: "o-1",
        pricePaise: 20000,
        stock: 10,
      });

      const { reference, totalPaise } = await createOnlineOrder({
        items: [{ slug: "o-1", quantity: 2 }],
        customer: CUSTOMER,
      });

      const order = await prisma.order.findUniqueOrThrow({
        where: { reference },
        include: { items: true, history: true },
      });
      expect(order.status).toBe("AWAITING_PAYMENT");
      expect(order.paymentStatus).toBe("PENDING");
      expect(order.totalPaise).toBe(totalPaise);
      // 2 * 20000 = 40000 + 18% (7200) + 4000 shipping
      expect(order.subtotalPaise).toBe(40000);
      expect(order.taxPaise).toBe(7200);
      expect(order.shippingPaise).toBe(4000);
      expect(order.totalPaise).toBe(51200);
      expect(order.items).toHaveLength(1);
      expect(order.items[0]!.unitPricePaise).toBe(20000);
      expect(order.history.map((h) => h.toStatus)).toEqual([
        "AWAITING_PAYMENT",
      ]);

      const inv = await prisma.inventory.findUniqueOrThrow({
        where: { productId: p.id },
      });
      expect(inv.quantityOnHand).toBe(10);
      expect(inv.quantityReserved).toBe(2);

      const audit = await prisma.auditLog.findFirst({
        where: { action: "order.create", entityId: order.id },
      });
      expect(audit).not.toBeNull();
    });

    it("reserves against concurrent buyers: the second order for the last unit fails, nothing partial persists", async () => {
      await makeProduct({
        sku: "O-2",
        slug: "o-2",
        pricePaise: 10000,
        stock: 1,
      });

      await createOnlineOrder({
        items: [{ slug: "o-2", quantity: 1 }],
        customer: CUSTOMER,
      });

      const before = await prisma.order.count();
      await expect(
        createOnlineOrder({
          items: [{ slug: "o-2", quantity: 1 }],
          customer: { ...CUSTOMER, name: "Second Buyer" },
        }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
      expect(await prisma.order.count()).toBe(before);
    });

    it("rejects invalid customer data without creating an order", async () => {
      await makeProduct({
        sku: "O-3",
        slug: "o-3",
        pricePaise: 10000,
        stock: 5,
      });
      await expect(
        createOnlineOrder({
          items: [{ slug: "o-3", quantity: 1 }],
          customer: { ...CUSTOMER, pincode: "12" },
        }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
      expect(await prisma.order.count()).toBe(0);
    });

    it("rejects a blocked pincode and a non-serviceable state", async () => {
      await makeProduct({
        sku: "O-4",
        slug: "o-4",
        pricePaise: 10000,
        stock: 5,
      });
      await expect(
        createOnlineOrder({
          items: [{ slug: "o-4", quantity: 1 }],
          customer: { ...CUSTOMER, pincode: "626999" },
        }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
      await expect(
        createOnlineOrder({
          items: [{ slug: "o-4", quantity: 1 }],
          customer: { ...CUSTOMER, stateCode: "29", pincode: "560001" },
        }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
      expect(await prisma.order.count()).toBe(0);
    });

    it("rejects an out-of-stock cart", async () => {
      await makeProduct({
        sku: "O-5",
        slug: "o-5",
        pricePaise: 10000,
        stock: 1,
      });
      await expect(
        createOnlineOrder({
          items: [{ slug: "o-5", quantity: 3 }],
          customer: CUSTOMER,
        }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
      expect(await prisma.order.count()).toBe(0);
    });

    it("rate-limits order creation from one connection", async () => {
      await makeProduct({
        sku: "O-6",
        slug: "o-6",
        pricePaise: 10000,
        stock: 100,
      });
      let rateLimited = false;
      for (let i = 0; i < 12; i++) {
        try {
          await createOnlineOrder({
            items: [{ slug: "o-6", quantity: 1 }],
            customer: CUSTOMER,
          });
        } catch (err) {
          if ((err as { code?: string }).code === "RATE_LIMITED") {
            rateLimited = true;
            break;
          }
          throw err;
        }
      }
      expect(rateLimited).toBe(true);
    });
  });

  describe("getOrderByReference", () => {
    it("returns a safe projection and 404s an unknown reference", async () => {
      await makeProduct({
        sku: "R-1",
        slug: "r-1",
        pricePaise: 10000,
        stock: 5,
      });
      const { reference } = await createOnlineOrder({
        items: [{ slug: "r-1", quantity: 1 }],
        customer: CUSTOMER,
      });

      const view = await getOrderByReference(reference);
      expect(view.reference).toBe(reference);
      expect(view).not.toHaveProperty("customerId");
      expect(view).not.toHaveProperty("id");
      expect(JSON.stringify(view)).not.toMatch(/version|holdExpires/i);

      await expect(
        getOrderByReference("this-reference-does-not-exist-000"),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("internal orders view", () => {
    it("requires orders.view (staff may read, anonymous may not)", async () => {
      logout();
      await expect(listOrders({})).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
      });
      await loginAs(prisma, "S1");
      const res = await listOrders({});
      expect(Array.isArray(res.rows)).toBe(true);
    });
  });
});
