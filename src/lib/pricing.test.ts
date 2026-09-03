import { describe, it, expect } from "vitest";
import { computeLine, computeShipping, computeOrderTotals } from "./pricing";

const flat = (flatPaise: number, freeAbovePaise = 0) =>
  ({ mode: "flat", flatPaise, freeAbovePaise }) as const;

describe("computeLine", () => {
  it("GST-exclusive: adds GST on top", () => {
    const l = computeLine(
      { unitPricePaise: 10000, gstRateBp: 1800, quantity: 2 },
      false,
    );
    expect(l.lineSubtotalPaise).toBe(20000);
    expect(l.lineTaxPaise).toBe(3600);
    expect(l.lineTotalPaise).toBe(23600);
  });

  it("GST-inclusive: extracts the GST already in the price", () => {
    const l = computeLine(
      { unitPricePaise: 11800, gstRateBp: 1800, quantity: 1 },
      true,
    );
    expect(l.lineTotalPaise).toBe(11800);
    expect(l.lineTaxPaise).toBe(1800);
    expect(l.lineSubtotalPaise).toBe(10000);
    expect(l.lineSubtotalPaise + l.lineTaxPaise).toBe(l.lineTotalPaise);
  });

  it("zero GST rate", () => {
    const l = computeLine(
      { unitPricePaise: 5000, gstRateBp: 0, quantity: 3 },
      false,
    );
    expect(l.lineTaxPaise).toBe(0);
    expect(l.lineTotalPaise).toBe(15000);
  });

  it("rounds the tax to the nearest paisa", () => {
    const l = computeLine(
      { unitPricePaise: 3333, gstRateBp: 1800, quantity: 1 },
      false,
    );
    // 3333 * 0.18 = 599.94 -> 600
    expect(l.lineTaxPaise).toBe(600);
  });
});

describe("computeShipping", () => {
  it("mode none is always free", () => {
    expect(
      computeShipping(999999, {
        mode: "none",
        flatPaise: 5000,
        freeAbovePaise: 0,
      }),
    ).toBe(0);
  });
  it("flat rate applies below the free-shipping threshold", () => {
    expect(computeShipping(40000, flat(5000, 50000))).toBe(5000);
  });
  it("free above the threshold", () => {
    expect(computeShipping(50000, flat(5000, 50000))).toBe(0);
    expect(computeShipping(60000, flat(5000, 50000))).toBe(0);
  });
  it("threshold of 0 means never free", () => {
    expect(computeShipping(10_000_000, flat(5000, 0))).toBe(5000);
  });
});

describe("computeOrderTotals", () => {
  it("sums lines and is internally consistent", () => {
    const totals = computeOrderTotals(
      [
        { unitPricePaise: 10000, gstRateBp: 1800, quantity: 2 },
        { unitPricePaise: 5000, gstRateBp: 500, quantity: 1 },
      ],
      { pricesIncludeGst: false, shipping: flat(4000) },
    );
    expect(totals.subtotalPaise).toBe(25000);
    expect(totals.taxPaise).toBe(3600 + 250);
    expect(totals.shippingPaise).toBe(4000);
    expect(totals.totalPaise).toBe(
      totals.subtotalPaise -
        totals.discountPaise +
        totals.taxPaise +
        totals.shippingPaise,
    );
    expect(totals.totalPaise).toBe(25000 + 3850 + 4000);
  });

  it("inclusive pricing: total equals sum of gross line totals plus shipping", () => {
    const totals = computeOrderTotals(
      [{ unitPricePaise: 11800, gstRateBp: 1800, quantity: 3 }],
      { pricesIncludeGst: true, shipping: flat(0) },
    );
    expect(totals.totalPaise).toBe(35400);
    expect(totals.subtotalPaise + totals.taxPaise).toBe(35400);
  });

  it("empty cart yields zeroes and no shipping", () => {
    const totals = computeOrderTotals([], {
      pricesIncludeGst: true,
      shipping: flat(5000),
    });
    expect(totals.totalPaise).toBe(0);
    expect(totals.shippingPaise).toBe(0);
  });
});
