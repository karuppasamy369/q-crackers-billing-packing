import { handleCashfreeWebhook } from "@/server/services/payments-service";
import { isAppError } from "@/server/http/errors";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Cashfree payment-status webhook. Public (Cashfree calls this directly, no
 * session) — the signature check inside `handleCashfreeWebhook` is the only
 * authentication, and it always runs BEFORE any field from the body is
 * trusted. Always read the raw text body: signature verification is over the
 * exact bytes Cashfree sent, not a re-serialised object.
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-webhook-signature");
  const timestamp = req.headers.get("x-webhook-timestamp");

  try {
    const result = await handleCashfreeWebhook(rawBody, signature, timestamp);
    // 200 either way — Cashfree retries on anything else, and "nothing to do"
    // (unknown order, wrong provider, not-yet-successful payment) is a normal
    // outcome, not an error.
    return Response.json({ ok: true, handled: result.handled });
  } catch (err) {
    if (isAppError(err) && err.code === "FORBIDDEN") {
      // Bad signature — the one case worth a non-200 so a misconfigured
      // integration is visible rather than silently swallowed.
      return Response.json({ error: "Invalid signature." }, { status: 401 });
    }
    logger.error("cashfree.webhook_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    // Ack anyway: a transient failure on our side should not make Cashfree
    // hammer retries indefinitely — the reconciliation sweep will catch up.
    return Response.json({ ok: false });
  }
}
