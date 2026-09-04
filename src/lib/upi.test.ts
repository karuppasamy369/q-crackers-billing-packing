import { describe, it, expect } from "vitest";
import {
  isValidUpiVpa,
  isValidUpiReference,
  normalizeUpiReference,
  buildUpiUri,
} from "./upi";

describe("isValidUpiVpa", () => {
  it("accepts realistic handles", () => {
    for (const v of [
      "shop@okhdfcbank",
      "q.crackers@okaxis",
      "9876543210@ybl",
      "name-1_2@okicici",
    ]) {
      expect(isValidUpiVpa(v)).toBe(true);
    }
  });

  it("rejects malformed handles", () => {
    for (const v of ["", "noatsign", "@bank", "user@", "a@b@c", "user @okaxis"]) {
      expect(isValidUpiVpa(v)).toBe(false);
    }
  });
});

describe("upi reference / UTR", () => {
  it("normalises to upper-case, no spaces", () => {
    expect(normalizeUpiReference("  abc 123 def  ")).toBe("ABC123DEF");
  });

  it("accepts 8–35 char alphanumerics (12-digit UTR included)", () => {
    expect(isValidUpiReference("123456789012")).toBe(true);
    expect(isValidUpiReference("AXIS0001234567")).toBe(true);
    expect(isValidUpiReference("12345678")).toBe(true);
  });

  it("rejects too-short, too-long, or punctuated values", () => {
    expect(isValidUpiReference("1234567")).toBe(false);
    expect(isValidUpiReference("1".repeat(36))).toBe(false);
    expect(isValidUpiReference("abc-123-def")).toBe(false);
  });
});

describe("buildUpiUri", () => {
  it("encodes amount in rupees with two decimals and INR currency", () => {
    const uri = buildUpiUri({
      vpa: "shop@okhdfcbank",
      payeeName: "Q Crackers",
      amountPaise: 123456,
      note: "Order abc123",
    });
    expect(uri.startsWith("upi://pay?")).toBe(true);
    const params = new URLSearchParams(uri.slice("upi://pay?".length));
    expect(params.get("pa")).toBe("shop@okhdfcbank");
    expect(params.get("pn")).toBe("Q Crackers");
    expect(params.get("am")).toBe("1234.56");
    expect(params.get("cu")).toBe("INR");
    expect(params.get("tn")).toBe("Order abc123");
  });

  it("omits the note when not supplied", () => {
    const uri = buildUpiUri({
      vpa: "a@b",
      payeeName: "x",
      amountPaise: 100,
    });
    expect(uri).not.toContain("tn=");
    expect(new URLSearchParams(uri.slice(10)).get("am")).toBe("1.00");
  });
});
