/**
 * UPI helpers. Pure — no server imports.
 *
 * A UPI "collect"/"pay" deep link:
 *   upi://pay?pa=<vpa>&pn=<payee name>&am=<amount ₹>&cu=INR&tn=<note>
 * Any UPI app (GPay, PhonePe, Paytm, …) opens it with the fields pre-filled.
 */
export const UPI_VPA_RE = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9.\-_]{1,63}$/;

export function isValidUpiVpa(value: string): boolean {
  return UPI_VPA_RE.test(value.trim());
}

/** A UPI reference / bank UTR: 12 digits is the RBI norm, but PSP txn ids vary.
 *  Accept 8–35 chars of digits and upper-case letters. */
export const UPI_REFERENCE_RE = /^[0-9A-Z]{8,35}$/;

export function normalizeUpiReference(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function isValidUpiReference(value: string): boolean {
  return UPI_REFERENCE_RE.test(normalizeUpiReference(value));
}

export type UpiLinkInput = {
  vpa: string;
  payeeName: string;
  amountPaise: number;
  note?: string;
};

export function buildUpiUri(input: UpiLinkInput): string {
  const rupees = (input.amountPaise / 100).toFixed(2);
  const params = new URLSearchParams({
    pa: input.vpa.trim(),
    pn: input.payeeName.trim().slice(0, 99),
    am: rupees,
    cu: "INR",
  });
  if (input.note) params.set("tn", input.note.slice(0, 99));
  return `upi://pay?${params.toString()}`;
}
