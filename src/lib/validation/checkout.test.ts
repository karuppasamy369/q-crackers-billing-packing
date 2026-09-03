import { describe, it, expect } from "vitest";
import {
  cartItemSchema,
  cartSchema,
  customerDetailsSchema,
  checkoutSchema,
  MAX_QTY_PER_LINE,
} from "./checkout";

describe("cart schemas", () => {
  it("cart item requires a valid slug and a positive quantity", () => {
    expect(
      cartItemSchema.safeParse({ slug: "snd-1000", quantity: 2 }).success,
    ).toBe(true);
    expect(
      cartItemSchema.safeParse({ slug: "Bad Slug", quantity: 1 }).success,
    ).toBe(false);
    expect(
      cartItemSchema.safeParse({ slug: "snd-1000", quantity: 0 }).success,
    ).toBe(false);
    expect(
      cartItemSchema.safeParse({
        slug: "snd-1000",
        quantity: MAX_QTY_PER_LINE + 1,
      }).success,
    ).toBe(false);
  });

  it("cart rejects empty and duplicate-slug carts", () => {
    expect(cartSchema.safeParse([]).success).toBe(false);
    expect(
      cartSchema.safeParse([
        { slug: "a", quantity: 1 },
        { slug: "a", quantity: 2 },
      ]).success,
    ).toBe(false);
    expect(
      cartSchema.safeParse([
        { slug: "a", quantity: 1 },
        { slug: "b", quantity: 2 },
      ]).success,
    ).toBe(true);
  });
});

describe("customerDetailsSchema", () => {
  const ok = {
    name: "Priya R",
    phone: "9876543210",
    addressLine1: "12 Market Road",
    city: "Sivakasi",
    stateCode: "33",
    pincode: "626123",
  };

  it("accepts a well-formed customer", () => {
    expect(customerDetailsSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects a bad phone number", () => {
    expect(
      customerDetailsSchema.safeParse({ ...ok, phone: "12345" }).success,
    ).toBe(false);
  });

  it("rejects a bad pincode", () => {
    expect(
      customerDetailsSchema.safeParse({ ...ok, pincode: "62612" }).success,
    ).toBe(false);
  });

  it("rejects an unknown state code", () => {
    expect(
      customerDetailsSchema.safeParse({ ...ok, stateCode: "99" }).success,
    ).toBe(false);
  });

  it("rejects an empty name", () => {
    expect(customerDetailsSchema.safeParse({ ...ok, name: "" }).success).toBe(
      false,
    );
  });

  it("allows a blank email but rejects a malformed one", () => {
    expect(customerDetailsSchema.safeParse({ ...ok, email: "" }).success).toBe(
      true,
    );
    expect(
      customerDetailsSchema.safeParse({ ...ok, email: "nope" }).success,
    ).toBe(false);
  });
});

describe("checkoutSchema", () => {
  it("combines cart + customer", () => {
    const parsed = checkoutSchema.safeParse({
      items: [{ slug: "snd-1000", quantity: 1 }],
      customer: {
        name: "A B",
        phone: "9876543210",
        addressLine1: "1 Road",
        city: "Town",
        stateCode: "33",
        pincode: "600001",
      },
    });
    expect(parsed.success).toBe(true);
  });
});
