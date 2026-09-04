import { describe, it, expect } from "vitest";
import { trackingTokenSchema, trackingOrderIdSchema } from "./tracking";

describe("trackingTokenSchema", () => {
  it("accepts a 43-char base64url token (32 random bytes)", () => {
    const token = "a".repeat(43);
    expect(trackingTokenSchema.safeParse(token).success).toBe(true);
    expect(
      trackingTokenSchema.safeParse("aB3-_xY0" + "z".repeat(35)).success,
    ).toBe(true);
  });

  it("rejects short, empty, or punctuated values", () => {
    for (const bad of [
      "",
      "short",
      "a".repeat(20),
      "a".repeat(80),
      "has spaces here!!",
      "tok/with+chars=",
    ]) {
      expect(trackingTokenSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe("trackingOrderIdSchema", () => {
  it("requires a uuid orderId", () => {
    expect(
      trackingOrderIdSchema.safeParse({
        orderId: "11111111-1111-4111-8111-111111111111",
      }).success,
    ).toBe(true);
    expect(trackingOrderIdSchema.safeParse({ orderId: "nope" }).success).toBe(
      false,
    );
  });
});
