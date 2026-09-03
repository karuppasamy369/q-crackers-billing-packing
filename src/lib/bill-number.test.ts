import { describe, it, expect } from "vitest";
import {
  formatBillNumber,
  parseBillNumber,
  isValidBillCode,
} from "./bill-number";

describe("formatBillNumber", () => {
  it("matches the agreed format", () => {
    expect(formatBillNumber("PK", 2026, 1)).toBe("PK-2026-0001");
    expect(formatBillNumber("PSR", 2026, 1)).toBe("PSR-2026-0001");
    expect(formatBillNumber("KA", 2026, 42)).toBe("KA-2026-0042");
    expect(formatBillNumber("S1", 2026, 1)).toBe("S1-2026-0001");
    expect(formatBillNumber("S2", 2026, 1234)).toBe("S2-2026-1234");
  });

  it("widens past 9999 without losing digits", () => {
    expect(formatBillNumber("PK", 2026, 12345)).toBe("PK-2026-12345");
  });

  it("rejects bad codes and sequences", () => {
    expect(() => formatBillNumber("bad code", 2026, 1)).toThrow();
    expect(() => formatBillNumber("PK", 2026, 0)).toThrow();
    expect(() => formatBillNumber("PK", 2026, -1)).toThrow();
  });
});

describe("isValidBillCode", () => {
  it("accepts PK / PSR / KA / S1 / S2, rejects junk", () => {
    for (const c of ["PK", "PSR", "KA", "S1", "S2"]) {
      expect(isValidBillCode(c)).toBe(true);
    }
    expect(isValidBillCode("")).toBe(false);
    expect(isValidBillCode("A")).toBe(false); // too short
    expect(isValidBillCode("lowercase")).toBe(false);
    expect(isValidBillCode("HAS SPACE")).toBe(false);
  });
});

describe("parseBillNumber", () => {
  it("round-trips", () => {
    const p = parseBillNumber("PK-2026-0001");
    expect(p).toEqual({ code: "PK", fiscalYear: 2026, sequenceNo: 1 });
  });
  it("rejects malformed strings", () => {
    expect(parseBillNumber("PK/2026/1")).toBeNull();
    expect(parseBillNumber("2026-0001")).toBeNull();
  });
});
