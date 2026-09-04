import { logger } from "@/lib/logger";
import { maskPhone } from "@/lib/notifications/phone";
import type { WhatsAppProvider, OutboundMessage, SendOutcome } from "./types";

export type MetaConfig = {
  accessToken: string;
  phoneNumberId: string;
  apiVersion: string;
};

/** Map our locale codes to WhatsApp template language codes. */
function languageCode(locale: string): string {
  return locale === "ta" ? "ta" : "en";
}

/**
 * WhatsApp Business Cloud API adapter (Meta).
 *
 * Business-initiated order updates require pre-approved message templates — the
 * adapter sends a `template` message when `templateName` is given (the normal
 * path) and falls back to a plain `text` message otherwise (useful only inside
 * a 24-hour customer-service window / for local testing).
 *
 * The access token is read once from `env`, sent only in the `Authorization`
 * header, and never logged.
 */
export class MetaWhatsAppProvider implements WhatsAppProvider {
  readonly name = "meta";
  readonly configured = true;
  private readonly cfg: MetaConfig;

  constructor(cfg: MetaConfig) {
    this.cfg = cfg;
  }

  private endpoint(): string {
    return `https://graph.facebook.com/${this.cfg.apiVersion}/${this.cfg.phoneNumberId}/messages`;
  }

  private buildPayload(m: OutboundMessage, locale: string): unknown {
    const to = m.toE164.replace(/^\+/, "");
    if (m.templateName) {
      return {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: m.templateName,
          language: { code: languageCode(locale) },
          components: (m.templateParams ?? []).length
            ? [
                {
                  type: "body",
                  parameters: (m.templateParams ?? []).map((text) => ({
                    type: "text",
                    text,
                  })),
                },
              ]
            : [],
        },
      };
    }
    return {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: m.body, preview_url: true },
    };
  }

  async send(message: OutboundMessage): Promise<SendOutcome> {
    let res: Response;
    try {
      res = await fetch(this.endpoint(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.cfg.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(this.buildPayload(message, message.locale)),
      });
    } catch (err) {
      // Network / DNS / timeout — always worth retrying.
      logger.warn("whatsapp.meta.network_error", {
        to: maskPhone(message.toE164),
        error: err instanceof Error ? err.message : "network error",
      });
      return { ok: false, retryable: true, error: "network error" };
    }

    let bodyText = "";
    try {
      bodyText = await res.text();
    } catch {
      bodyText = "";
    }

    if (res.ok) {
      let id: string | undefined;
      try {
        id = JSON.parse(bodyText)?.messages?.[0]?.id;
      } catch {
        /* fall through */
      }
      if (id) return { ok: true, providerMessageId: id };
      return {
        ok: false,
        retryable: true,
        error: "accepted but no message id in response",
      };
    }

    // Extract a short, safe error summary (never echoes the request) and scrub
    // our own access token in case the API reflected it back.
    let summary = `HTTP ${res.status}`;
    try {
      const err = JSON.parse(bodyText)?.error;
      if (err?.message) {
        summary = `HTTP ${res.status}: ${err.message}`.slice(0, 300);
      }
    } catch {
      /* keep the status-only summary */
    }
    summary = summary.split(this.cfg.accessToken).join("[redacted]");

    const retryable =
      res.status === 408 || res.status === 429 || res.status >= 500;
    logger.warn("whatsapp.meta.send_failed", {
      to: maskPhone(message.toE164),
      status: res.status,
      retryable,
    });
    return { ok: false, retryable, error: summary };
  }
}
