import type { WhatsAppProvider, SendOutcome } from "./types";

/**
 * The provider used when `WHATSAPP_PROVIDER=none` (or unset). It never sends
 * anything: the worker sees `configured === false` and leaves the outbox row
 * PENDING with a "not configured" note, so the app runs normally and the
 * backlog delivers automatically once a real provider is configured.
 */
export class NullWhatsAppProvider implements WhatsAppProvider {
  readonly name = "none";
  readonly configured = false;

  async send(): Promise<SendOutcome> {
    return {
      ok: false,
      retryable: true,
      error: "WhatsApp provider is not configured",
    };
  }
}
