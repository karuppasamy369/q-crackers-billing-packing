import { describe, it, expect } from "vitest";
import {
  bookParcelSchema,
  bookingOrderIdSchema,
  readyToBookFilterSchema,
  coverPrintSchema,
  coverBulkSchema,
} from "./booking";

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

describe("readyToBookFilterSchema", () => {
  it("accepts an empty filter and defaults page to 1", () => {
    const r = readyToBookFilterSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.page).toBe(1);
  });

  it("accepts a fully populated filter", () => {
    const r = readyToBookFilterSchema.safeParse({
      from: "2026-01-01",
      to: "2026-01-31",
      courier: "Professional Couriers",
      partnerCode: "pk",
      city: "Sivakasi",
      pincode: "62615",
      q: "9876543210",
      page: "2",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.partnerCode).toBe("PK"); // uppercased
      expect(r.data.page).toBe(2);
    }
  });

  it("rejects a malformed date", () => {
    expect(
      readyToBookFilterSchema.safeParse({ from: "01-01-2026" }).success,
    ).toBe(false);
    expect(
      readyToBookFilterSchema.safeParse({ from: "2026-13-40" }).success,
    ).toBe(false);
  });

  it("rejects `from` after `to`", () => {
    const r = readyToBookFilterSchema.safeParse({
      from: "2026-02-01",
      to: "2026-01-01",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a pincode with letters or more than 6 digits", () => {
    expect(
      readyToBookFilterSchema.safeParse({ pincode: "62615A" }).success,
    ).toBe(false);
    expect(
      readyToBookFilterSchema.safeParse({ pincode: "1234567" }).success,
    ).toBe(false);
  });

  it("rejects an out-of-range page", () => {
    expect(readyToBookFilterSchema.safeParse({ page: "0" }).success).toBe(
      false,
    );
    expect(
      readyToBookFilterSchema.safeParse({ page: "100001" }).success,
    ).toBe(false);
  });
});

describe("coverPrintSchema", () => {
  it("defaults parcels to 1 and accepts no `only`", () => {
    const r = coverPrintSchema.safeParse({ orderId: ID });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.parcels).toBe(1);
      expect(r.data.only).toBeUndefined();
    }
  });

  it("accepts a parcel count and a specific parcel to print", () => {
    const r = coverPrintSchema.safeParse({
      orderId: ID,
      parcels: "3",
      only: "2",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.parcels).toBe(3);
      expect(r.data.only).toBe(2);
    }
  });

  it("rejects an invalid order id", () => {
    expect(
      coverPrintSchema.safeParse({ orderId: "not-a-uuid" }).success,
    ).toBe(false);
  });

  it("rejects a zero or absurdly large parcel count", () => {
    expect(
      coverPrintSchema.safeParse({ orderId: ID, parcels: "0" }).success,
    ).toBe(false);
    expect(
      coverPrintSchema.safeParse({ orderId: ID, parcels: "51" }).success,
    ).toBe(false);
  });
});

describe("coverBulkSchema", () => {
  it("accepts a list of order ids", () => {
    const r = coverBulkSchema.safeParse({ orderIds: [ID] });
    expect(r.success).toBe(true);
  });

  it("rejects an empty list", () => {
    expect(coverBulkSchema.safeParse({ orderIds: [] }).success).toBe(false);
  });

  it("rejects more than 100 ids", () => {
    expect(
      coverBulkSchema.safeParse({ orderIds: Array(101).fill(ID) }).success,
    ).toBe(false);
  });

  it("rejects a non-uuid entry", () => {
    expect(
      coverBulkSchema.safeParse({ orderIds: [ID, "nope"] }).success,
    ).toBe(false);
  });
});
