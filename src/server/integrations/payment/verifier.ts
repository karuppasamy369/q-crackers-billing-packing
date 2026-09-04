/**
 * Payment verification abstraction (no Razorpay).
 *
 * Phase 5 shipped `manualVerifier` only: an authorised partner checks their
 * bank / UPI app and confirms. Phase 10 adds a real PSP (Cashfree) behind the
 * same interface — a verified payment always ends up as
 * `PaymentStatus.VERIFIED` with a `verificationMethod`, and no other code path
 * needed to change.
 *
 * Rules any implementation MUST follow:
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

/** The only verifier in Phase 5 / the hybrid fallback in Phase 10. A human
 *  does the checking. */
export const manualVerifier: PaymentVerifier = {
  name: "MANUAL",
};

function cashfreeVerifierFor(partnerCode: string): PaymentVerifier {
  return {
    name: "CASHFREE",
    async lookup({ orderId, amountPaise }) {
      // Imported lazily to keep this file free of node-only crypto imports
      // when only the manual verifier is used.
      const { getCashfreeCredentials, getCashfreeOrderPayments } =
        await import("./cashfree");
      const creds = getCashfreeCredentials(partnerCode);
      if (!creds) return { status: "pending" };

      let payments;
      try {
        payments = await getCashfreeOrderPayments(creds, orderId);
      } catch {
        // Network / provider hiccup — never conclusive.
        return { status: "pending" };
      }

      const success = payments.find((p) => p.status === "SUCCESS");
      if (success) {
        if (success.amountPaise !== amountPaise) {
          return {
            status: "mismatch",
            reason: `Cashfree reports ${success.amountPaise} paise, order expects ${amountPaise}.`,
            raw: success,
          };
        }
        return {
          status: "verified",
          utr: success.bankReference ?? success.cfPaymentId,
          amountPaise: success.amountPaise,
          raw: success,
        };
      }
      if (payments.some((p) => p.status === "PENDING")) {
        return { status: "pending" };
      }
      return { status: "not_found" };
    },
  };
}

/**
 * Registry hook. `partnerCode` is required for provider-specific verifiers
 * (each partner holds their own PSP credentials); it's ignored for MANUAL.
 */
export function getVerifier(
  provider: string,
  partnerCode?: string | null,
): PaymentVerifier {
  if (provider === "CASHFREE" && partnerCode) {
    return cashfreeVerifierFor(partnerCode);
  }
  // MANUAL, and any unknown provider, falls back to a human verifying.
  return manualVerifier;
}
