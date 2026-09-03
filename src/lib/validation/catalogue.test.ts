import { describe, it, expect } from "vitest";
import {
  categoryCreateSchema,
  productCreateSchema,
  productPriceSchema,
  inventoryAdjustSchema,
  skuSchema,
} from "./catalogue";

describe("categoryCreateSchema", () => {
  it("accepts a name and defaults the rest", () => {
    const out = categoryCreateSchema.parse({ name: "Sparklers" });
    expect(out.isActive).toBe(true);
    expect(out.sortOrder).toBe(0);
  });
  it("rejects an invalid custom slug", () => {
    expect(
      categoryCreateSchema.safeParse({ name: "X", slug: "Bad Slug" }).success,
    ).toBe(false);
  });
});

describe("skuSchema", () => {
  it("upper-cases and constrains characters", () => {
    expect(skuSchema.parse("snd-1000")).toBe("SND-1000");
    expect(skuSchema.safeParse("bad sku!").success).toBe(false);
  });
});

describe("productCreateSchema", () => {
  const base = {
    sku: "SND-1000",
    name: "1000 Wala",
    categoryId: "0b3d4f9e-1a2b-4c3d-8e9f-0a1b2c3d4e5f",
    priceRupees: "450",
  };

  it("converts rupees to paise", () => {
    const out = productCreateSchema.parse(base);
    expect(out.priceRupees).toBe(45000);
    expect(out.isVisibleOnline).toBe(false);
  });

  it("rejects a bad price", () => {
    expect(
      productCreateSchema.safeParse({ ...base, priceRupees: "abc" }).success,
    ).toBe(false);
  });
});

describe("productPriceSchema", () => {
  const id = "0b3d4f9e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";
  it("rejects an MRP below the selling price", () => {
    expect(
      productPriceSchema.safeParse({
        id,
        priceRupees: "500",
        mrpRupees: "400",
      }).success,
    ).toBe(false);
  });
  it("accepts MRP >= price", () => {
    expect(
      productPriceSchema.safeParse({
        id,
        priceRupees: "400",
        mrpRupees: "500",
      }).success,
    ).toBe(true);
  });
});

describe("inventoryAdjustSchema", () => {
  const pid = "0b3d4f9e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";
  it("set mode requires quantity >= 0", () => {
    expect(
      inventoryAdjustSchema.safeParse({
        productId: pid,
        mode: "set",
        quantity: "-1",
        reason: "ADJUSTMENT",
      }).success,
    ).toBe(false);
  });
  it("delta mode rejects zero", () => {
    expect(
      inventoryAdjustSchema.safeParse({
        productId: pid,
        mode: "delta",
        quantity: "0",
        reason: "RESTOCK",
      }).success,
    ).toBe(false);
  });
  it("accepts a negative delta", () => {
    expect(
      inventoryAdjustSchema.safeParse({
        productId: pid,
        mode: "delta",
        quantity: "-5",
        reason: "ADJUSTMENT",
      }).success,
    ).toBe(true);
  });
  it("rejects an unknown reason (e.g. SALE — not manual)", () => {
    expect(
      inventoryAdjustSchema.safeParse({
        productId: pid,
        mode: "delta",
        quantity: "5",
        reason: "SALE",
      }).success,
    ).toBe(false);
  });
});
