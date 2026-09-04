import "server-only";

import { env } from "@/env";
import type { WhatsAppProvider } from "./types";
import { NullWhatsAppProvider } from "./null-provider";
import { LogWhatsAppProvider } from "./log-provider";
import { MetaWhatsAppProvider } from "./meta-provider";

export type { WhatsAppProvider, OutboundMessage, SendOutcome } from "./types";

let instance: WhatsAppProvider | undefined;

/** The configured WhatsApp provider (singleton). */
export function getWhatsAppProvider(): WhatsAppProvider {
  if (instance) return instance;

  switch (env.WHATSAPP_PROVIDER) {
    case "meta":
      instance = new MetaWhatsAppProvider({
        accessToken: env.WHATSAPP_ACCESS_TOKEN!,
        phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID!,
        apiVersion: env.WHATSAPP_API_VERSION,
      });
      break;
    case "log":
      instance = new LogWhatsAppProvider();
      break;
    default:
      instance = new NullWhatsAppProvider();
  }
  return instance;
}

/** Test hook — drop the memoised provider so a new env can take effect. */
export function _resetWhatsAppProvider(): void {
  instance = undefined;
}

/** Test hook — force a specific provider (e.g. a stub). Pass `undefined` to
 *  fall back to the env-configured provider on the next call. */
export function _setWhatsAppProvider(p: WhatsAppProvider | undefined): void {
  instance = p;
}
