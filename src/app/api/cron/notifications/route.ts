import { env } from "@/env";
import { processNotificationOutbox } from "@/server/services/notifications-service";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Drives the WhatsApp notification outbox: reclaims stale in-flight rows,
 * reconciles any events missed by a best-effort enqueue, then delivers the due
 * batch with retry/backoff. Idempotent and safe to run frequently.
 *
 * Protect with a scheduler that sends `Authorization: Bearer <CRON_SECRET>`.
 * Disabled (503) until CRON_SECRET is configured.
 */
export async function GET(req: Request) {
  if (!env.CRON_SECRET) {
    return Response.json({ error: "Cron is not configured." }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const summary = await processNotificationOutbox();
    return Response.json({ ok: true, ...summary });
  } catch (err) {
    logger.error("cron.notifications_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ error: "Delivery run failed." }, { status: 500 });
  }
}

export const POST = GET;
