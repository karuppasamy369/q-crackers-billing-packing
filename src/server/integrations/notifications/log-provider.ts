import { randomUUID } from "node:crypto";
import { logger } from "@/lib/logger";
import { maskPhone } from "@/lib/notifications/phone";
import type { WhatsAppProvider, OutboundMessage, SendOutcome } from "./types";

/**
 * Development sink (`WHATSAPP_PROVIDER=log`). "Sends" by writing a line to the
 * server log — the phone number is masked and the body is truncated — and
 * returns a synthetic message id. Lets the whole outbox / retry flow be
 * exercised locally without a real WhatsApp account.
 */
export class LogWhatsAppProvider implements WhatsAppProvider {
  readonly name = "log";
  readonly configured = true;

  async send(message: OutboundMessage): Promise<SendOutcome> {
    logger.info("whatsapp.log_provider.send", {
      to: maskPhone(message.toE164),
      preview: message.body.slice(0, 80),
      template: message.templateName ?? null,
    });
    return { ok: true, providerMessageId: `log_${randomUUID()}` };
  }
}
