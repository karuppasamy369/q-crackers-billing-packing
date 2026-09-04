import { normalizeIndianMobile } from "@/lib/india";

/**
 * Resolve a customer phone to the E.164 form WhatsApp expects (`+91XXXXXXXXXX`)
 * or `null` when it is missing / not a valid Indian mobile. Thin wrapper over
 * {@link normalizeIndianMobile} so notification code has one obvious entry point.
 */
export function toWhatsAppRecipient(
  phone: string | null | undefined,
): string | null {
  if (!phone || !phone.trim()) return null;
  return normalizeIndianMobile(phone);
}

/** `+919876543210` → `+9198•••••210` for logs — never log a full number. */
export function maskPhone(e164: string | null | undefined): string {
  if (!e164) return "(none)";
  const digits = e164.replace(/[^\d+]/g, "");
  if (digits.length < 7) return "•••";
  return `${digits.slice(0, 5)}•••••${digits.slice(-3)}`;
}
