import { env } from "@/env";
import { reconcileCashfreePayments } from "@/server/services/payments-service";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Reconciliation sweep for Cashfree payments: catches anything the webhook
 * missed by polling Cashfree's own order-payments API for orders stuck
 * INITIATED a few minutes after checkout. Never marks anything failed on its
 * own initiative — only ever advances a genuinely successful payment.
 *
 * Protect with the same scheduler pattern as the other cron routes:
 * `Authorization: Bearer <CRON_SECRET>`. Disabled (503) until CRON_SECRET is
 * configured. Safe to call every ~2-5 min; idempotent.
 */
export async function GET(req: Request) {
  if (!env.CRON_SECRET) {
    return Response.json(
      { error: "Cron is not configured." },
      { status: 503 },
    );
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await reconcileCashfreePayments();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    logger.error("cron.reconcile_cashfree_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ error: "Sweep failed." }, { status: 500 });
  }
}

export const POST = GET;
