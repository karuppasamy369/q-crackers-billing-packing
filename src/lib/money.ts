import { z } from "zod";

/**
 * Money handling. Every amount in the system is a non-negative integer number
 * of **paise** (1 rupee = 100 paise). Never use floats for money.
 */

export const PAISE_PER_RUPEE = 100;

/** Largest amount we accept anywhere (₹1,00,00,000 = 1 crore). Guards typos. */
export const MAX_PAISE = 100_00_00_000;

export function isValidPaise(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_PAISE
  );
}

/** Parse a user-entered rupee string/number (e.g. "199.50") into paise. */
export function rupeesToPaise(input: string | number): number {
  const raw = typeof input === "number" ? input.toString() : input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    throw new Error("Enter an amount in rupees, e.g. 199 or 199.50");
  }
  const [rupees, frac = ""] = raw.split(".");
  const paise = Number(rupees) * PAISE_PER_RUPEE + Number(frac.padEnd(2, "0"));
  if (!isValidPaise(paise)) throw new Error("Amount is out of range.");
  return paise;
}

export function paiseToRupeesString(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / PAISE_PER_RUPEE);
  const frac = (abs % PAISE_PER_RUPEE).toString().padStart(2, "0");
  return `${sign}${rupees}.${frac}`;
}

/** Format for display, e.g. 19950 -> "₹199.50" with Indian digit grouping. */
export function formatPaise(paise: number): string {
  const rupees = paise / PAISE_PER_RUPEE;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(rupees);
}

/** Zod schema for an amount stored as paise (accepts a rupee string in forms). */
export const paiseFromRupeesInput = z
  .union([z.string(), z.number()])
  .transform((v, ctx) => {
    try {
      return rupeesToPaise(v);
    } catch (e) {
      ctx.addIssue({
        code: "custom",
        message: e instanceof Error ? e.message : "Invalid amount.",
      });
      return z.NEVER;
    }
  });

/** GST rate expressed in basis points (1800 = 18.00%). 0..50%. */
export const gstRateBpSchema = z.coerce
  .number()
  .int()
  .min(0)
  .max(5000, "GST rate cannot exceed 50%.");

export function formatGstRateBp(bp: number): string {
  return `${(bp / 100).toFixed(bp % 100 === 0 ? 0 : 2)}%`;
}
