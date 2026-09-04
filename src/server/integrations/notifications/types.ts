/**
 * WhatsApp delivery abstraction.
 *
 * The rest of the app never talks to a WhatsApp API directly — it writes rows
 * to `notification_outbox` and a worker hands each message to the configured
 * `WhatsAppProvider`. Swapping Meta for another WhatsApp Business provider is a
 * new adapter here plus an `env.WHATSAPP_PROVIDER` value; nothing else changes.
 *
 * Rules every adapter MUST follow:
 *   - read credentials from `env` only; never from a database or the client
 *   - never log the access token, Authorization header, or full request body
 *   - classify failures: `retryable` transient errors (5xx, 429, network) vs.
 *     permanent ones (invalid recipient, bad template) which must not retry
 *   - be side-effect-free on construction (no network in the constructor)
 */
export type OutboundMessage = {
  /** E.164, e.g. "+919876543210". */
  toE164: string;
  /** Plain-text body — already rendered and localised. */
  body: string;
  /** Locale the message is in ("en" / "ta") — selects the template language. */
  locale: string;
  /** For template-based providers: the approved template name + ordered params.
   *  Free-form providers ignore these and send `body`. */
  templateName?: string;
  templateParams?: string[];
};

export type SendOutcome =
  | { ok: true; providerMessageId: string }
  | { ok: false; retryable: boolean; error: string };

export interface WhatsAppProvider {
  /** Stable identifier stored on the outbox row, e.g. "none" | "log" | "meta". */
  readonly name: string;
  /** True when the adapter has everything it needs to actually send. */
  readonly configured: boolean;
  send(message: OutboundMessage): Promise<SendOutcome>;
}
