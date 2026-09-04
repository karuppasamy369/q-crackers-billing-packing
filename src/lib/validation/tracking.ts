import { z } from "zod";
import { uuidSchema } from "./common";

/**
 * A raw tracking token: 32 bytes of CSPRNG output, base64url-encoded → 43
 * characters of `[A-Za-z0-9_-]`. We accept a small range so a trailing-slash or
 * legacy length never 500s — anything outside it is simply "not found".
 */
export const trackingTokenSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{32,64}$/);

/** `orderId` for the console tracking-management actions. */
export const trackingOrderIdSchema = z.object({ orderId: uuidSchema });
