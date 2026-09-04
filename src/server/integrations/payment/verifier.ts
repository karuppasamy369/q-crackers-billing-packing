/**
 * Payment verification abstraction (no Razorpay).
 *
 * Today the only verifier is `manualVerifier`: an authorised partner checks
 * their bank / UPI app (and, optionally, an uploaded payment screenshot) and
 * confirms. This interface exists so a future PSP/bank integration can slot
 * in behind it later with no change to `payments-service.ts` — a verified
 * payment always ends up as `PaymentStatus.VERIFIED` with a
 * `verificationMethod`. A Cashfree integration was evaluated and reverted
 * (see `docs/decisions.md` #22); nothing PSP-specific remains, only this
 * empty extension point.
 *
 * Rules any future implementation MUST follow:
 *   - never trust a client claim ("I paid") — confirmation comes from the bank
 *     / PSP / a human with access to the account
 *   - assert the payment is for the right order and the amount matches
 *   - be idempotent: an order is looked up / processed at most once per
 *     outcome; an already-VERIFIED payment is a no-op
 */
export type VerificationOutcome =
  | { status: "verified"; utr: string; amountPaise: number; raw?: unknown }
  | { status: "not_found" }
  | { status: "pending" }
  | { status: "mismatch"; reason: string; raw?: unknown };

export interface PaymentVerifier {
  readonly name: string;

  /** Ask the PSP what happened to this order (by our own order reference,
   *  which is also what we hand the PSP as *their* order id at checkout).
   *  Absent for MANUAL — a human is the only verifier. Never throws for an
   *  ordinary "still pending" state; a genuine failure to reach the PSP
   *  should resolve to `{ status: "pending" }` so a caller keeps waiting
   *  rather than treating a network hiccup as anything conclusive. */
  lookup?(params: {
    orderId: string;
    amountPaise: number;
  }): Promise<VerificationOutcome>;
}

/** The only verifier today. A human does the checking. */
export const manualVerifier: PaymentVerifier = {
  name: "MANUAL",
};

/**
 * Registry hook. `partnerCode` is accepted (and currently unused) so a future
 * provider that needs per-partner credentials can be added here without
 * changing any call site.
 */
export function getVerifier(
  provider: string,
  partnerCode?: string | null,
): PaymentVerifier {
  void provider;
  void partnerCode;
  // Every provider falls back to a human verifying — no PSP is wired up.
  return manualVerifier;
}
