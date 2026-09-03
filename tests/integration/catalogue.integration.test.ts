/**
 * Phase 2 integration tests. Skipped unless TEST_DATABASE_URL is set.
 * CI runs `prisma migrate deploy` + `npm run db:seed` first, so roles,
 * permissions and the PK/PSR/KA/S1/S2 accounts already exist.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  TEST_DB,
  db as prisma,
  loginAs,
  logout,
  resetCatalogue,
} from "./_context";
import { isAppError } from "@/server/http/errors";
import {
  createCategory,
  listCategories,
} from "@/server/services/categories-service";
import {
  createProduct,
  updateProductPrice,
  addProductImage,
  loadProductImageBytes,
  setProductVisibility,
} from "@/server/services/products-service";
import { adjustStock } from "@/server/services/inventory-service";
import { updateSettings } from "@/server/services/settings-service";
import {
  listPublicProducts,
  getPublicProduct,
} from "@/server/services/storefront-service";

const d = TEST_DB ? describe : describe.skip;

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

async function seedCategoryAndProduct(sku = "SND-1") {
  await loginAs(prisma, "PK");
  const cat = await createCategory({ name: `Cat ${sku}`, sortOrder: 0 });
  const product = await createProduct({
    sku,
    name: `Product ${sku}`,
    categoryId: cat.id,
    priceRupees: "100",
  });
  logout();
  return { cat, product };
}

d("Phase 2 — catalogue & inventory", () => {
  beforeEach(async () => {
    await resetCatalogue(prisma);
    logout();
  });

  describe("RBAC — staff cannot modify catalogue, prices or settings", () => {
    it("staff createProduct → 403", async () => {
      await loginAs(prisma, "S1");
      const cat = await prisma.category.create({
        data: { name: "C", slug: `c-${Date.now()}` },
      });
      await expect(
        createProduct({
          sku: "X1",
          name: "X",
          categoryId: cat.id,
          priceRupees: "10",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("staff createCategory → 403", async () => {
      await loginAs(prisma, "S2");
      await expect(createCategory({ name: "Nope" })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("staff updateProductPrice → 403", async () => {
      const { product } = await seedCategoryAndProduct("PR-1");
      await loginAs(prisma, "S1");
      await expect(
        updateProductPrice({ id: product.id, priceRupees: "5" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("staff adjustStock → 403", async () => {
      const { product } = await seedCategoryAndProduct("ST-1");
      await loginAs(prisma, "S1");
      await expect(
        adjustStock({
          productId: product.id,
          mode: "delta",
          quantity: "5",
          reason: "RESTOCK",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("staff updateSettings → 403", async () => {
      await loginAs(prisma, "S2");
      await expect(
        updateSettings({ "storefront.announcement": "hi" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("unauthenticated createProduct → 401", async () => {
      logout();
      await expect(
        createProduct({
          sku: "Z",
          name: "Z",
          categoryId: "00000000-0000-0000-0000-000000000000",
          priceRupees: "1",
        }),
      ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    });
  });

  describe("partner can manage the catalogue", () => {
    it("creates a product with an inventory row", async () => {
      const { product } = await seedCategoryAndProduct("INV-1");
      const inv = await prisma.inventory.findUnique({
        where: { productId: product.id },
      });
      expect(inv).not.toBeNull();
      expect(inv?.quantityOnHand).toBe(0);
    });

    it("price change is recorded in the audit log", async () => {
      const { product } = await seedCategoryAndProduct("AUD-1");
      await loginAs(prisma, "PK");
      await updateProductPrice({ id: product.id, priceRupees: "250" });
      const audit = await prisma.auditLog.findFirst({
        where: { action: "product.price_update", entityId: product.id },
      });
      expect(audit).not.toBeNull();
      const updated = await prisma.product.findUnique({
        where: { id: product.id },
      });
      expect(updated?.pricePaise).toBe(25000);
    });
  });

  describe("storefront never exposes hidden products", () => {
    it("excludes offline and inactive products, and products in inactive categories", async () => {
      await loginAs(prisma, "PK");
      const cat = await createCategory({ name: "Visible" });
      const hiddenCat = await createCategory({ name: "Hidden" });

      const online = await createProduct({
        sku: "ON-1",
        name: "Online",
        categoryId: cat.id,
        priceRupees: "100",
      });
      const offline = await createProduct({
        sku: "OFF-1",
        name: "Offline",
        categoryId: cat.id,
        priceRupees: "100",
      });
      const inHiddenCat = await createProduct({
        sku: "HC-1",
        name: "In hidden category",
        categoryId: hiddenCat.id,
        priceRupees: "100",
      });

      // Publish the first one (needs an image).
      await addProductImage({ productId: online.id }, PNG);
      await setProductVisibility({
        id: online.id,
        isActive: true,
        isVisibleOnline: true,
      });
      // Try to publish the one in the hidden category, then hide the category.
      await addProductImage({ productId: inHiddenCat.id }, PNG);
      await setProductVisibility({
        id: inHiddenCat.id,
        isActive: true,
        isVisibleOnline: true,
      });
      await prisma.category.update({
        where: { id: hiddenCat.id },
        data: { isActive: false },
      });
      logout();

      const list = await listPublicProducts({});
      const slugs = list.rows.map((r) => r.slug);
      expect(slugs).toContain(online.slug);
      expect(slugs).not.toContain(offline.slug);
      expect(slugs).not.toContain(inHiddenCat.slug);

      await expect(getPublicProduct(offline.slug)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });

      // The public projection carries no SKU / stock / internal flags.
      const card = list.rows.find((r) => r.slug === online.slug)!;
      expect(Object.keys(card)).toEqual(
        expect.arrayContaining([
          "slug",
          "name",
          "pricePaise",
          "mrpPaise",
          "primaryImageId",
        ]),
      );
      expect(card).not.toHaveProperty("sku");
      expect(card).not.toHaveProperty("isActive");
      expect(JSON.stringify(card)).not.toMatch(/quantity/i);
    });
  });

  describe("image upload validation", () => {
    it("rejects a non-image and an oversized file, accepts a real PNG", async () => {
      const { product } = await seedCategoryAndProduct("IMG-1");
      await loginAs(prisma, "PK");

      await expect(
        addProductImage(
          { productId: product.id },
          new Uint8Array([0x25, 0x50, 0x44, 0x46]),
        ),
      ).rejects.toMatchObject({ code: "VALIDATION" });

      await expect(
        addProductImage(
          { productId: product.id },
          new Uint8Array(6 * 1024 * 1024),
        ),
      ).rejects.toMatchObject({ code: "VALIDATION" });

      await addProductImage({ productId: product.id }, PNG);
      const images = await prisma.productImage.findMany({
        where: { productId: product.id },
      });
      expect(images).toHaveLength(1);
      expect(images[0]!.isPrimary).toBe(true);
    });

    it("image bytes are gated for an offline product, public once published", async () => {
      const { product } = await seedCategoryAndProduct("GATE-1");
      await loginAs(prisma, "PK");
      await addProductImage({ productId: product.id }, PNG);
      const img = await prisma.productImage.findFirstOrThrow({
        where: { productId: product.id },
      });
      logout();

      expect(await loadProductImageBytes(img.id, false)).toBe("forbidden");
      expect(await loadProductImageBytes(img.id, true)).not.toBe("forbidden");

      await loginAs(prisma, "PK");
      await setProductVisibility({
        id: product.id,
        isActive: true,
        isVisibleOnline: true,
      });
      logout();

      const anon = await loadProductImageBytes(img.id, false);
      expect(anon).not.toBe("forbidden");
      expect(anon).not.toBe("not_found");
    });
  });

  describe("stock adjustments", () => {
    it("records a movement with the running balance and blocks going negative", async () => {
      const { product } = await seedCategoryAndProduct("MV-1");
      await loginAs(prisma, "PK");

      await adjustStock({
        productId: product.id,
        mode: "delta",
        quantity: "50",
        reason: "RESTOCK",
      });
      await adjustStock({
        productId: product.id,
        mode: "delta",
        quantity: "-20",
        reason: "ADJUSTMENT",
        note: "damaged",
      });

      const movements = await prisma.inventoryMovement.findMany({
        where: { productId: product.id },
        orderBy: { createdAt: "asc" },
      });
      expect(movements.map((m) => [m.changeQty, m.balanceAfter])).toEqual([
        [50, 50],
        [-20, 30],
      ]);

      const inv = await prisma.inventory.findUnique({
        where: { productId: product.id },
      });
      expect(inv?.quantityOnHand).toBe(30);

      await expect(
        adjustStock({
          productId: product.id,
          mode: "delta",
          quantity: "-100",
          reason: "ADJUSTMENT",
        }),
      ).rejects.toMatchObject({ code: "VALIDATION" });

      // still 30, and the failed attempt left no movement row
      const after = await prisma.inventoryMovement.count({
        where: { productId: product.id },
      });
      expect(after).toBe(2);
    });

    it("set mode writes the delta correctly and is audited", async () => {
      const { product } = await seedCategoryAndProduct("MV-2");
      await loginAs(prisma, "PK");
      await adjustStock({
        productId: product.id,
        mode: "set",
        quantity: "12",
        reason: "ADJUSTMENT",
      });
      const move = await prisma.inventoryMovement.findFirstOrThrow({
        where: { productId: product.id },
      });
      expect(move.changeQty).toBe(12);
      expect(move.balanceAfter).toBe(12);

      const audit = await prisma.auditLog.findFirst({
        where: { action: "inventory.adjust", entityId: product.id },
      });
      expect(audit).not.toBeNull();
    });
  });

  describe("settings", () => {
    it("partner update persists and is audited; unknown keys rejected", async () => {
      await loginAs(prisma, "PK");
      const res = await updateSettings({
        "storefront.announcement": "Diwali sale is on!",
        "shipping.flatPaise": "5000",
      });
      expect(res.changed.sort()).toEqual(
        ["shipping.flatPaise", "storefront.announcement"].sort(),
      );

      const row = await prisma.setting.findUnique({
        where: { key: "storefront.announcement" },
      });
      expect(row?.value).toBe("Diwali sale is on!");

      const audit = await prisma.auditLog.findFirst({
        where: { action: "settings.update" },
        orderBy: { createdAt: "desc" },
      });
      expect(audit).not.toBeNull();

      await expect(updateSettings({ "not.a.key": "x" })).rejects.toMatchObject({
        code: "VALIDATION",
      });

      await expect(
        updateSettings({ "billing.housePartnerCode": "not a code" }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
    });
  });

  it("isAppError is used to classify the thrown errors", () => {
    // sanity guard so the import is exercised even if a block above is skipped
    expect(isAppError(new Error("x"))).toBe(false);
  });

  it("listCategories requires products.view (staff may read)", async () => {
    await seedCategoryAndProduct("CV-1");
    await loginAs(prisma, "S1");
    const cats = await listCategories();
    expect(Array.isArray(cats)).toBe(true);
  });
});
