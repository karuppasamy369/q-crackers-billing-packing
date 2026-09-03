import { z } from "zod";

/**
 * Business settings registry — the single source of truth for every
 * configurable value.
 *
 * Each entry declares a Zod schema, a default, whether the value is safe to
 * expose to the public storefront, and UI metadata. `settings-service` reads
 * and writes rows in the `settings` table against this registry; anything not
 * listed here cannot be stored.
 *
 * No server-only imports — the storefront imports this to read public values.
 */

export const LOCALES = ["en", "ta"] as const;
export type Locale = (typeof LOCALES)[number];

type Group =
  | "Business"
  | "Tax"
  | "Catalogue"
  | "Shipping"
  | "Fulfilment"
  | "Storefront"
  | "Billing";

type SettingDef<T> = {
  schema: z.ZodType<T>;
  default: T;
  /** Safe to send to the browser / storefront. */
  public: boolean;
  group: Group;
  label: string;
  help?: string;
  /** Rendering hint for the console form. */
  input: "text" | "textarea" | "number" | "boolean" | "csv" | "select";
  options?: readonly string[];
};

const gstinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine(
    (v) =>
      v === "" ||
      /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(v),
    { message: "Enter a valid 15-character GSTIN, or leave blank." },
  );

const stateCodeSchema = z
  .string()
  .trim()
  .regex(/^[0-9]{2}$/, "Enter the 2-digit GST state code (e.g. 33).");

const pincodeListSchema = z
  .array(z.string().regex(/^[1-9][0-9]{5}$/, "Each pincode must be 6 digits."))
  .max(5000);

const nonNegInt = z.coerce.number().int().min(0);

/** Accepts a real boolean or the usual truthy form strings. */
const booleanish = z.preprocess(
  (v) =>
    typeof v === "string"
      ? ["true", "on", "1", "yes"].includes(v.toLowerCase())
      : v,
  z.boolean(),
);

export const SETTINGS = {
  "business.legalName": {
    schema: z.string().trim().min(1).max(200),
    default: "Q Crackers",
    public: false,
    group: "Business",
    label: "Legal / business name",
    input: "text",
  } satisfies SettingDef<string>,

  "business.gstin": {
    schema: gstinSchema,
    default: "",
    public: false,
    group: "Business",
    label: "GSTIN",
    help: "Used on tax invoices. Leave blank if not GST-registered.",
    input: "text",
  } satisfies SettingDef<string>,

  "business.address": {
    schema: z.string().trim().max(1000),
    default: "",
    public: false,
    group: "Business",
    label: "Registered address",
    input: "textarea",
  } satisfies SettingDef<string>,

  "business.stateCode": {
    schema: stateCodeSchema,
    default: "33",
    public: false,
    group: "Business",
    label: "Home state code",
    help: "GST state code of the place of supply (33 = Tamil Nadu). Decides CGST/SGST vs IGST later.",
    input: "text",
  } satisfies SettingDef<string>,

  "business.phone": {
    schema: z.string().trim().max(20),
    default: "",
    public: true,
    group: "Business",
    label: "Contact phone (shown on storefront)",
    input: "text",
  } satisfies SettingDef<string>,

  "tax.defaultGstRateBp": {
    schema: z.coerce.number().int().min(0).max(5000),
    default: 1800,
    public: false,
    group: "Tax",
    label: "Default GST rate for new products (basis points)",
    help: "1800 = 18.00%. Per-product rates override this.",
    input: "number",
  } satisfies SettingDef<number>,

  "tax.pricesIncludeGst": {
    schema: booleanish,
    default: true,
    public: true,
    group: "Tax",
    label: "Displayed prices already include GST",
    input: "boolean",
  } satisfies SettingDef<boolean>,

  "shipping.mode": {
    schema: z.enum(["none", "flat", "pincode", "weight"]),
    default: "flat",
    public: true,
    group: "Shipping",
    label: "Shipping charge mode",
    help: "Only 'none' and 'flat' are calculated in V1; the others are placeholders.",
    input: "select",
    options: ["none", "flat", "pincode", "weight"],
  } satisfies SettingDef<"none" | "flat" | "pincode" | "weight">,

  "shipping.flatPaise": {
    schema: nonNegInt,
    default: 0,
    public: true,
    group: "Shipping",
    label: "Flat shipping charge (paise)",
    input: "number",
  } satisfies SettingDef<number>,

  "shipping.freeAbovePaise": {
    schema: nonNegInt,
    default: 0,
    public: true,
    group: "Shipping",
    label: "Free shipping above order value (paise, 0 = never)",
    input: "number",
  } satisfies SettingDef<number>,

  "fulfilment.serviceableStateCodes": {
    schema: z.array(z.string().regex(/^[0-9]{2}$/)).max(40),
    default: [],
    public: false,
    group: "Fulfilment",
    label: "Serviceable state codes (empty = evaluate per pincode / allow all)",
    help: "Fireworks shipping is restricted. List the GST state codes you can legally deliver to.",
    input: "csv",
  } satisfies SettingDef<string[]>,

  "fulfilment.blockedPincodes": {
    schema: pincodeListSchema,
    default: [],
    public: false,
    group: "Fulfilment",
    label: "Blocked pincodes",
    input: "csv",
  } satisfies SettingDef<string[]>,

  "fulfilment.restrictionNotice": {
    schema: z.string().trim().max(500),
    default: "",
    public: true,
    group: "Fulfilment",
    label: "Delivery restriction notice (shown to customers)",
    input: "textarea",
  } satisfies SettingDef<string>,

  "storefront.enabledLocales": {
    schema: z.array(z.enum(LOCALES)).min(1),
    default: ["en", "ta"],
    public: true,
    group: "Storefront",
    label: "Enabled languages",
    input: "csv",
  } satisfies SettingDef<Locale[]>,

  "storefront.defaultLocale": {
    schema: z.enum(LOCALES),
    default: "en",
    public: true,
    group: "Storefront",
    label: "Default language",
    input: "select",
    options: LOCALES,
  } satisfies SettingDef<Locale>,

  "storefront.announcement": {
    schema: z.string().trim().max(300),
    default: "",
    public: true,
    group: "Storefront",
    label: "Announcement banner",
    input: "text",
  } satisfies SettingDef<string>,

  "billing.housePartnerCode": {
    schema: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^P[1-9][0-9]*$/, "Must be a partner code like P1."),
    default: "P1",
    public: false,
    group: "Billing",
    label: "House partner code for auto-generated online-order bills",
    input: "text",
  } satisfies SettingDef<string>,
} as const;

export type SettingKey = keyof typeof SETTINGS;
export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

export type SettingValue<K extends SettingKey> = z.infer<
  (typeof SETTINGS)[K]["schema"]
>;

export type SettingsSnapshot = {
  [K in SettingKey]: SettingValue<K>;
};

export function isSettingKey(value: string): value is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTINGS, value);
}

export const PUBLIC_SETTING_KEYS = SETTING_KEYS.filter(
  (k) => SETTINGS[k].public,
);

export type PublicSettingKey = (typeof PUBLIC_SETTING_KEYS)[number];
export type PublicSettingsSnapshot = Pick<SettingsSnapshot, PublicSettingKey>;

export function defaultSettings(): SettingsSnapshot {
  const out = {} as SettingsSnapshot;
  for (const key of SETTING_KEYS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (out as any)[key] = SETTINGS[key].default;
  }
  return out;
}

export function settingsByGroup(): Record<string, SettingKey[]> {
  const out: Record<string, SettingKey[]> = {};
  for (const key of SETTING_KEYS) {
    (out[SETTINGS[key].group] ??= []).push(key);
  }
  return out;
}

/** UI metadata for a setting, with the optional fields normalised. */
export type SettingMeta = {
  label: string;
  help?: string;
  group: Group;
  public: boolean;
  input: "text" | "textarea" | "number" | "boolean" | "csv" | "select";
  options?: readonly string[];
};

export function settingMeta(key: SettingKey): SettingMeta {
  const d = SETTINGS[key] as {
    label: string;
    help?: string;
    group: Group;
    public: boolean;
    input: SettingMeta["input"];
    options?: readonly string[];
  };
  return {
    label: d.label,
    help: d.help,
    group: d.group,
    public: d.public,
    input: d.input,
    options: d.options,
  };
}
