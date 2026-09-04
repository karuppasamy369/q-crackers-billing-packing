import { describe, it, expect } from "vitest";
import { reportRangeSchema, toDateWindow } from "./reports";

describe("reportRangeSchema", () => {
  it("defaults to a ~30-day window when nothing is given", () => {
    const r = reportRangeSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      const span =
        (Date.parse(`${r.data.to}T00:00:00Z`) -
          Date.parse(`${r.data.from}T00:00:00Z`)) /
        86_400_000;
      expect(span).toBeGreaterThanOrEqual(28);
      expect(span).toBeLessThanOrEqual(31);
    }
  });

  it("accepts a valid explicit range", () => {
    const r = reportRangeSchema.safeParse({
      from: "2026-01-01",
      to: "2026-01-31",
    });
    expect(r.success).toBe(true);
  });

  it("rejects from-after-to", () => {
    expect(
      reportRangeSchema.safeParse({ from: "2026-02-01", to: "2026-01-01" })
        .success,
    ).toBe(false);
  });

  it("rejects a range longer than 400 days", () => {
    expect(
      reportRangeSchema.safeParse({ from: "2023-01-01", to: "2026-01-01" })
        .success,
    ).toBe(false);
  });

  it("rejects malformed dates and pre-2020 dates", () => {
    expect(reportRangeSchema.safeParse({ from: "01-01-2026" }).success).toBe(
      false,
    );
    expect(
      reportRangeSchema.safeParse({ from: "2019-06-01", to: "2019-06-30" })
        .success,
    ).toBe(false);
  });

  it("toDateWindow produces a half-open [gte, lt) UTC range", () => {
    const r = reportRangeSchema.parse({ from: "2026-03-01", to: "2026-03-01" });
    const w = toDateWindow(r);
    expect(w.gte.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(w.lt.toISOString()).toBe("2026-03-02T00:00:00.000Z");
  });
});
