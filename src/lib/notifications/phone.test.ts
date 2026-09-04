import { describe, it, expect } from "vitest";
import { toWhatsAppRecipient, maskPhone } from "./phone";

describe("toWhatsAppRecipient", () => {
  it("normalises valid Indian mobiles to E.164", () => {
    expect(toWhatsAppRecipient("98765 43210")).toBe("+919876543210");
    expect(toWhatsAppRecipient("+91-9876543210")).toBe("+919876543210");
    expect(toWhatsAppRecipient("09876543210")).toBe("+919876543210");
  });

  it("returns null for missing / invalid numbers", () => {
    for (const bad of [
      null,
      undefined,
      "",
      "   ",
      "12345",
      "5876543210",
      "abcdefghij",
    ]) {
      expect(toWhatsAppRecipient(bad)).toBeNull();
    }
  });
});

describe("maskPhone", () => {
  it("masks the middle and never returns the full number", () => {
    const masked = maskPhone("+919876543210");
    expect(masked).toContain("•");
    expect(masked).not.toContain("9876543210");
    expect(masked.endsWith("210")).toBe(true);
  });
  it("handles empty input", () => {
    expect(maskPhone(null)).toBe("(none)");
  });
});
