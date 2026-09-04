import { describe, it, expect } from "vitest";
import { bookParcelSchema, bookingOrderIdSchema } from "./booking";

const ID = "11111111-1111-4111-8111-111111111111";
const today = new Date().toISOString().slice(0, 10);

const valid = {
  orderId: ID,
  courierName: "Professional Couriers",
  lrNumber: "TN-2026/0091",
  bookingDate: today,
  parcelCount: "3",
  remarks: "",
};

describe("bookingOrderIdSchema", () => {
  it("requires a uuid", () => {
    expect(bookingOrderIdSchema.safeParse({ orderId: ID }).success).toBe(true);
    expect(bookingOrderIdSchema.safeParse({ orderId: "nope" }).success).toBe(
      false,
    );
  });
});

describe("bookParcelSchema", () => {
  it("accepts a complete, valid booking", () => {
    const r = bookParcelSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.parcelCount).toBe(3);
  });

  it("rejects a missing / short courier name", () => {
    expect(
      bookParcelSchema.safeParse({ ...valid, courierName: "" }).success,
    ).toBe(false);
    expect(
      bookParcelSchema.safeParse({ ...valid, courierName: "A" }).success,
    ).toBe(false);
  });

  it("rejects an LR number with illegal characters", () => {
    expect(
      bookParcelSchema.safeParse({ ...valid, lrNumber: "LR#@!" }).success,
    ).toBe(false);
  });

  it("rejects a zero / negative / huge parcel count", () => {
    expect(
      bookParcelSchema.safeParse({ ...valid, parcelCount: "0" }).success,
    ).toBe(false);
    expect(
      bookParcelSchema.safeParse({ ...valid, parcelCount: "-1" }).success,
    ).toBe(false);
    expect(
      bookParcelSchema.safeParse({ ...valid, parcelCount: "1000" }).success,
    ).toBe(false);
    expect(
      bookParcelSchema.safeParse({ ...valid, parcelCount: "2.5" }).success,
    ).toBe(false);
  });

  it("rejects a far-future or pre-2020 booking date", () => {
    expect(
      bookParcelSchema.safeParse({ ...valid, bookingDate: "2999-01-01" })
        .success,
    ).toBe(false);
    expect(
      bookParcelSchema.safeParse({ ...valid, bookingDate: "2019-12-31" })
        .success,
    ).toBe(false);
    expect(
      bookParcelSchema.safeParse({ ...valid, bookingDate: "not-a-date" })
        .success,
    ).toBe(false);
  });

  it("rejects over-long remarks", () => {
    expect(
      bookParcelSchema.safeParse({ ...valid, remarks: "x".repeat(1001) })
        .success,
    ).toBe(false);
  });
});
