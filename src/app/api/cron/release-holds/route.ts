import { env } from "@/env";
import { releaseExpiredHolds } from "@/server/services/payments-service";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Sweep expired stock holds: any AWAITING_PAYMENT order whose hold has lapsed
 * without a verified payment is moved to PAYMENT_FAILED and its reservation
 * released.
 *
 * Protect with a scheduler that sends `Authorization: Bearer <CRON_SECRET>`
 * (Vercel Cron, GitHub Actions, an external uptime pinger, …). Disabled (503)
 * until CRON_SECRET is configured.
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
    const { released } = await releaseExpiredHolds();
    return Response.json({ ok: true, released });
  } catch (err) {
    logger.error("cron.release_holds_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ error: "Sweep failed." }, { status: 500 });
  }
}

export const POST = GET;
