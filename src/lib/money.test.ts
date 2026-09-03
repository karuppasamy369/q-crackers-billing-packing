import { describe, it, expect } from "vitest";
import {
  rupeesToPaise,
  paiseToRupeesString,
  formatPaise,
  isValidPaise,
  paiseFromRupeesInput,
  gstRateBpSchema,
  formatGstRateBp,
  MAX_PAISE,
} from "./money";

describe("money", () => {
  it("rupeesToPaise handles integers and 2-dp decimals", () => {
    expect(rupeesToPaise("199")).toBe(19900);
    expect(rupeesToPaise("199.50")).toBe(19950);
    expect(rupeesToPaise("0.05")).toBe(5);
    expect(rupeesToPaise(45)).toBe(4500);
  });

  it("rupeesToPaise rejects junk, negatives and >2dp", () => {
    expect(() => rupeesToPaise("abc")).toThrow();
    expect(() => rupeesToPaise("-5")).toThrow();
    expect(() => rupeesToPaise("1.234")).toThrow();
    expect(() => rupeesToPaise("")).toThrow();
  });

  it("rejects out-of-range amounts", () => {
    expect(() => rupeesToPaise(String(MAX_PAISE / 100 + 1))).toThrow();
  });

  it("paiseToRupeesString round-trips", () => {
    expect(paiseToRupeesString(19950)).toBe("199.50");
    expect(paiseToRupeesString(5)).toBe("0.05");
    expect(paiseToRupeesString(0)).toBe("0.00");
  });

  it("isValidPaise only accepts non-negative integers in range", () => {
    expect(isValidPaise(0)).toBe(true);
    expect(isValidPaise(19950)).toBe(true);
    expect(isValidPaise(-1)).toBe(false);
    expect(isValidPaise(1.5)).toBe(false);
    expect(isValidPaise(MAX_PAISE + 1)).toBe(false);
    expect(isValidPaise("100")).toBe(false);
  });

  it("formatPaise renders rupees with 2 decimals", () => {
    const out = formatPaise(19950);
    expect(out).toContain("199.50");
  });

  it("paiseFromRupeesInput zod schema parses or reports an error", () => {
    expect(paiseFromRupeesInput.parse("199.50")).toBe(19950);
    expect(paiseFromRupeesInput.safeParse("nope").success).toBe(false);
  });

  it("gstRateBpSchema bounds 0..5000", () => {
    expect(gstRateBpSchema.parse("1800")).toBe(1800);
    expect(gstRateBpSchema.safeParse(-1).success).toBe(false);
    expect(gstRateBpSchema.safeParse(6000).success).toBe(false);
  });

  it("formatGstRateBp", () => {
    expect(formatGstRateBp(1800)).toBe("18%");
    expect(formatGstRateBp(1250)).toBe("12.50%");
  });
});
