import { describe, it, expect } from "vitest";
import {
  partnerLinkCodeSchema,
  submitPaymentSchema,
  verifyPaymentSchema,
  paymentAccountSchema,
} from "./payment";

const REF = "a".repeat(24);

describe("partnerLinkCodeSchema", () => {
  it("upper-cases and accepts login codes", () => {
    expect(partnerLinkCodeSchema.parse("pk")).toBe("PK");
    expect(partnerLinkCodeSchema.parse(" psr ")).toBe("PSR");
  });
  it("rejects junk", () => {
    expect(partnerLinkCodeSchema.safeParse("1pk").success).toBe(false);
    expect(partnerLinkCodeSchema.safeParse("a code").success).toBe(false);
    expect(partnerLinkCodeSchema.safeParse("").success).toBe(false);
  });
});

describe("submitPaymentSchema", () => {
  it("requires a valid reference and UTR", () => {
    const ok = submitPaymentSchema.safeParse({
      reference: REF,
      upiReference: "123456789012",
    });
    expect(ok.success).toBe(true);
  });

  it("rejects a missing / short UTR", () => {
    expect(
      submitPaymentSchema.safeParse({ reference: REF, upiReference: "12" })
        .success,
    ).toBe(false);
    expect(
      submitPaymentSchema.safeParse({ reference: REF }).success,
    ).toBe(false);
  });

  it("rejects a bad reference", () => {
    expect(
      submitPaymentSchema.safeParse({
        reference: "short",
        upiReference: "123456789012",
      }).success,
    ).toBe(false);
  });

  it("accepts an empty optional payer VPA but rejects a malformed one", () => {
    expect(
      submitPaymentSchema.safeParse({
        reference: REF,
        upiReference: "123456789012",
        payerVpa: "",
      }).success,
    ).toBe(true);
    expect(
      submitPaymentSchema.safeParse({
        reference: REF,
        upiReference: "123456789012",
        payerVpa: "not-a-vpa",
      }).success,
    ).toBe(false);
  });
});

describe("verifyPaymentSchema", () => {
  const id = "11111111-1111-4111-8111-111111111111";

  it("verify needs no note", () => {
    expect(
      verifyPaymentSchema.safeParse({ paymentId: id, action: "verify" })
        .success,
    ).toBe(true);
  });

  it("reject requires a reason of at least 3 chars", () => {
    expect(
      verifyPaymentSchema.safeParse({ paymentId: id, action: "reject" })
        .success,
    ).toBe(false);
    expect(
      verifyPaymentSchema.safeParse({
        paymentId: id,
        action: "reject",
        note: "no",
      }).success,
    ).toBe(false);
    expect(
      verifyPaymentSchema.safeParse({
        paymentId: id,
        action: "reject",
        note: "not received",
      }).success,
    ).toBe(true);
  });
});

describe("paymentAccountSchema", () => {
  it("coerces the isActive checkbox value", () => {
    expect(
      paymentAccountSchema.parse({ isActive: "true" }).isActive,
    ).toBe(true);
    expect(paymentAccountSchema.parse({ isActive: "" }).isActive).toBe(false);
  });

  it("rejects a malformed VPA but allows blank", () => {
    expect(
      paymentAccountSchema.safeParse({ upiVpa: "", isActive: "true" }).success,
    ).toBe(true);
    expect(
      paymentAccountSchema.safeParse({ upiVpa: "bad vpa", isActive: "true" })
        .success,
    ).toBe(false);
  });
});
