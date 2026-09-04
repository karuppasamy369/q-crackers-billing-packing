import { describe, it, expect } from "vitest";
import { getDictionary } from "@/lib/i18n";
import {
  interpolate,
  renderNotification,
  NOTIFICATION_EVENT_TYPES,
  TEMPLATE_NAME,
  type TemplateData,
} from "./templates";

const DATA: TemplateData = {
  name: "Ravi Kumar",
  orderNo: "PK-2026-0007",
  amount: "₹1,234.00",
  courier: "Professional Couriers",
  lrNumber: "TN-2026/0091",
  parcels: "3",
  link: "https://shop.example/track/abc123",
};

describe("interpolate", () => {
  it("fills placeholders", () => {
    expect(interpolate("Hi {name}, order {orderNo}", DATA as never)).toBe(
      "Hi Ravi Kumar, order PK-2026-0007",
    );
  });
  it("throws on a missing value", () => {
    expect(() => interpolate("Hi {missing}", {})).toThrow(/missing value/);
  });
  it("throws if a placeholder is left unresolved", () => {
    expect(() => interpolate("Hi {name} {oops:1}", { name: "x" })).toThrow(
      /unresolved/,
    );
  });
});

describe("renderNotification — every event, both locales", () => {
  const required: Record<
    (typeof NOTIFICATION_EVENT_TYPES)[number],
    (keyof TemplateData)[]
  > = {
    PAYMENT_RECEIVED: ["name", "orderNo", "amount", "link"],
    ORDER_PACKED: ["name", "orderNo", "link"],
    PARCEL_BOOKED: [
      "name",
      "orderNo",
      "courier",
      "lrNumber",
      "parcels",
      "link",
    ],
    LR_AVAILABLE: ["name", "orderNo", "lrNumber", "link"],
    REVIEW_REQUEST: ["name", "orderNo", "link"],
  };

  for (const event of NOTIFICATION_EVENT_TYPES) {
    for (const locale of ["en", "ta"] as const) {
      it(`${event} / ${locale} includes its required fields and no leftover placeholders`, () => {
        const r = renderNotification(event, DATA, getDictionary(locale));
        expect(r.templateName).toBe(TEMPLATE_NAME[event]);
        expect(r.body).not.toMatch(/\{[^}]+\}/);
        expect(r.body).toContain("Q Crackers");
        for (const field of required[event]) {
          expect(r.body).toContain(DATA[field]);
        }
        expect(r.templateParams.length).toBeGreaterThanOrEqual(3);
        expect(r.templateParams).toContain(DATA.link);
      });
    }
  }

  it("PARCEL_BOOKED carries courier + LR + parcel count as ordered params", () => {
    const r = renderNotification("PARCEL_BOOKED", DATA, getDictionary("en"));
    expect(r.templateParams).toEqual([
      DATA.name,
      DATA.orderNo,
      DATA.courier,
      DATA.lrNumber,
      DATA.parcels,
      DATA.link,
    ]);
  });
});
