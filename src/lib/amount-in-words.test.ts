import { describe, it, expect } from "vitest";
import { amountInWords } from "./amount-in-words";

describe("amountInWords", () => {
  it("whole rupees", () => {
    expect(amountInWords(0)).toBe("Rupees Zero only");
    expect(amountInWords(100)).toBe("Rupees One only");
    expect(amountInWords(45000)).toBe("Rupees Four Hundred Fifty only");
  });

  it("rupees and paise", () => {
    expect(amountInWords(19950)).toBe(
      "Rupees One Hundred Ninety Nine and Fifty Paise only",
    );
    expect(amountInWords(5)).toBe("Rupees Zero and Five Paise only");
  });

  it("indian grouping — thousand / lakh / crore", () => {
    expect(amountInWords(1_23_456_00)).toBe(
      "Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six only",
    );
    expect(amountInWords(12_34_56_789_00)).toContain("Twelve Crore");
  });

  it("negative", () => {
    expect(amountInWords(-100)).toBe("Minus Rupees One only");
  });
});
