/**
 * Payment gateway abstraction.
 *
 * Phase 3 only prepares the seam — no implementation is wired up yet. Phase 5
 * adds a Razorpay adapter behind this interface (and Cashfree/PhonePe can slot
 * in the same way). Rules that the Phase 5 implementation MUST follow:
 *
 *   - verify the webhook signature (HMAC) before trusting any payload
 *   - after the browser returns, fetch the payment status server-to-server and
 *     assert status = captured, amount = order total, currency = INR
 *   - every operation is idempotent (keyed by the provider payment id and the
 *     webhook event id)
 *   - the order is only marked PAID inside a DB transaction that also converts
 *     the stock reservation into a SALE movement
 */
export type PaymentIntent = {
  provider: string;
  providerOrderId: string;
  amountPaise: number;
  currency: "INR";
};

export type VerifiedPayment = {
  providerPaymentId: string;
  providerOrderId: string;
  amountPaise: number;
  currency: string;
  status: "captured" | "authorized" | "failed";
  raw: unknown;
};

export interface PaymentProvider {
  readonly name: string;

  /** Create a gateway order/intent for an internal order awaiting payment. */
  createIntent(input: {
    orderReference: string;
    amountPaise: number;
  }): Promise<PaymentIntent>;

  /** Validate a webhook request body + signature header. */
  verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean;

  /** Fetch the authoritative payment record from the gateway. */
  fetchPayment(providerPaymentId: string): Promise<VerifiedPayment>;
}
