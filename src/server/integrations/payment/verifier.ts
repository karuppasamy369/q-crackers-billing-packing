/**
 * Payment verification abstraction (no Razorpay).
 *
 * Phase 5 ships `ManualVerifier` only: an authorised partner checks their bank
 * / UPI app and confirms. Later, a bank/PSP adapter implements `lookup` (query
 * a UTR's status server-to-server) and/or `parseWebhook`, with no schema
 * change — a verified payment always ends up as `PaymentStatus.VERIFIED` with a
 * `verificationMethod`.
 *
 * Rules any implementation MUST follow:
 *   - never trust a client claim ("I paid") — confirmation comes from the bank
 *     / PSP / a human with access to the account
 *   - assert the payment is for the right order and the amount matches
 *   - be idempotent: a UTR is processed at most once; an already-VERIFIED
 *     payment is a no-op
 */
export type VerificationOutcome =
  | { status: "verified"; utr: string; amountPaise: number; raw?: unknown }
  | { status: "not_found" }
  | { status: "pending" }
  | { status: "mismatch"; reason: string; raw?: unknown };

export type WebhookEvent = {
  eventId: string;
  utr: string;
  amountPaise: number;
  payeeVpa: string;
  raw: unknown;
};

export interface PaymentVerifier {
  readonly name: string;

  /** Query a UTR's status with the bank / PSP. Absent for MANUAL. */
  lookup?(params: {
    utr: string;
    amountPaise: number;
    payeeVpa: string;
  }): Promise<VerificationOutcome>;

  /** Validate + parse an incoming webhook. Absent for MANUAL. */
  parseWebhook?(rawBody: string, headers: Headers): Promise<WebhookEvent | null>;
}

/** The only verifier in Phase 5. A human does the checking. */
export const manualVerifier: PaymentVerifier = {
  name: "MANUAL",
};

/**
 * Registry hook. Returns the verifier for a provider name. Phase 5 only knows
 * MANUAL; future providers register here.
 */
export function getVerifier(provider: string): PaymentVerifier {
  if (provider === "MANUAL") return manualVerifier;
  // Unknown providers fall back to manual so verification is still possible.
  return manualVerifier;
}
