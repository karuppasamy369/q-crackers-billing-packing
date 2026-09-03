import { describe, it, expect } from "vitest";
import { indianFiscalYear, fiscalYearLabel } from "./fiscal-year";

describe("indianFiscalYear", () => {
  it("April–December is the current calendar year", () => {
    expect(indianFiscalYear(new Date("2026-04-01T00:00:00"))).toBe(2026);
    expect(indianFiscalYear(new Date("2026-09-04T12:00:00"))).toBe(2026);
    expect(indianFiscalYear(new Date("2026-12-31T23:00:00"))).toBe(2026);
  });

  it("January–March belongs to the FY that started the previous April", () => {
    expect(indianFiscalYear(new Date("2027-01-15T00:00:00"))).toBe(2026);
    expect(indianFiscalYear(new Date("2027-03-31T23:00:00"))).toBe(2026);
    expect(indianFiscalYear(new Date("2026-03-31T00:00:00"))).toBe(2025);
  });
});

describe("fiscalYearLabel", () => {
  it("renders start-year to two-digit end", () => {
    expect(fiscalYearLabel(2026)).toBe("2026-27");
    expect(fiscalYearLabel(2029)).toBe("2029-30");
    expect(fiscalYearLabel(2099)).toBe("2099-00");
  });
});
