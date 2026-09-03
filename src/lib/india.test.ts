import { describe, it, expect } from "vitest";
import {
  normalizeIndianMobile,
  isValidPincode,
  isValidStateCode,
  stateNameForCode,
} from "./india";

describe("normalizeIndianMobile", () => {
  it("accepts common formats and returns +91XXXXXXXXXX", () => {
    for (const input of [
      "9876543210",
      "98765 43210",
      "+91 9876543210",
      "+91-98765-43210",
      "09876543210",
      "91 9876543210",
    ]) {
      expect(normalizeIndianMobile(input)).toBe("+919876543210");
    }
  });

  it("rejects non-mobile / malformed numbers", () => {
    expect(normalizeIndianMobile("1234567890")).toBeNull(); // starts with 1
    expect(normalizeIndianMobile("98765")).toBeNull();
    expect(normalizeIndianMobile("+1 415 555 2671")).toBeNull();
    expect(normalizeIndianMobile("abcdefghij")).toBeNull();
    expect(normalizeIndianMobile("")).toBeNull();
  });
});

describe("pincode", () => {
  it("6 digits, not starting with 0", () => {
    expect(isValidPincode("600001")).toBe(true);
    expect(isValidPincode("060001")).toBe(false);
    expect(isValidPincode("60001")).toBe(false);
    expect(isValidPincode("6000012")).toBe(false);
    expect(isValidPincode("abcdef")).toBe(false);
  });
});

describe("GST state codes", () => {
  it("33 is Tamil Nadu", () => {
    expect(isValidStateCode("33")).toBe(true);
    expect(stateNameForCode("33")).toBe("Tamil Nadu");
  });
  it("unknown codes are rejected", () => {
    expect(isValidStateCode("99")).toBe(false);
    expect(stateNameForCode("99")).toBeNull();
  });
});
