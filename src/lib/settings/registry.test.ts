import { describe, it, expect } from "vitest";
import {
  SETTINGS,
  SETTING_KEYS,
  PUBLIC_SETTING_KEYS,
  defaultSettings,
  isSettingKey,
  settingMeta,
} from "./registry";

describe("settings registry", () => {
  it("every default validates against its own schema", () => {
    for (const key of SETTING_KEYS) {
      const parsed = SETTINGS[key].schema.safeParse(SETTINGS[key].default);
      expect(parsed.success, `${key} default invalid`).toBe(true);
    }
  });

  it("defaults round-trip through JSON (they are stored as JSONB)", () => {
    const snap = defaultSettings();
    for (const key of SETTING_KEYS) {
      const roundTripped = JSON.parse(JSON.stringify(snap[key]));
      expect(SETTINGS[key].schema.safeParse(roundTripped).success).toBe(true);
    }
  });

  it("keeps sensitive business config private", () => {
    for (const priv of [
      "business.gstin",
      "business.address",
      "business.stateCode",
      "tax.defaultGstRateBp",
      "fulfilment.serviceableStateCodes",
      "fulfilment.blockedPincodes",
      "billing.housePartnerCode",
    ]) {
      expect(PUBLIC_SETTING_KEYS).not.toContain(priv);
    }
  });

  it("booleanish setting parses form-style strings", () => {
    const schema = SETTINGS["tax.pricesIncludeGst"].schema;
    expect(schema.parse("true")).toBe(true);
    expect(schema.parse("on")).toBe(true);
    expect(schema.parse("false")).toBe(false);
    expect(schema.parse(false)).toBe(false);
  });

  it("GSTIN schema accepts blank or a valid 15-char id and rejects junk", () => {
    const s = SETTINGS["business.gstin"].schema;
    expect(s.safeParse("").success).toBe(true);
    expect(s.safeParse("33ABCDE1234F1Z5").success).toBe(true);
    expect(s.safeParse("not-a-gstin").success).toBe(false);
  });

  it("housePartnerCode must look like a partner code", () => {
    const s = SETTINGS["billing.housePartnerCode"].schema;
    expect(s.parse("p1")).toBe("P1");
    expect(s.safeParse("S1").success).toBe(false);
  });

  it("isSettingKey / settingMeta", () => {
    expect(isSettingKey("shipping.mode")).toBe(true);
    expect(isSettingKey("nope")).toBe(false);
    expect(settingMeta("shipping.mode").options).toContain("flat");
  });
});
