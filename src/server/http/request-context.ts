import "server-only";

import { headers } from "next/headers";
import type { RequestContext } from "@/server/services/audit";

/**
 * Best-effort client IP + user-agent for audit records.
 *
 * Behind Vercel / a reverse proxy the real client IP is in `x-forwarded-for`
 * (first entry). We never trust these values for authorization — only for the
 * audit trail.
 */
export async function getRequestContext(): Promise<RequestContext> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  const userAgent = h.get("user-agent");
  return {
    ip,
    userAgent: userAgent ? userAgent.slice(0, 512) : null,
  };
}
