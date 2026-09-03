/**
 * Best-effort in-process rate limiter (fixed window).
 *
 * This is a first line of defence only. It is per-instance, so on a
 * multi-instance / serverless deployment it does not give a global guarantee.
 * The authoritative brute-force protection for logins is the per-account
 * lockout persisted in the database. Phase 10 replaces this with a shared
 * store (e.g. Upstash Redis) for global limits on public endpoints.
 */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000),
    };
  }
  return {
    allowed: true,
    remaining: limit - existing.count,
    retryAfterSeconds: 0,
  };
}

/** Test / maintenance helper. */
export function _resetRateLimits(): void {
  buckets.clear();
}

// Opportunistic cleanup so the map does not grow unbounded.
if (typeof setInterval === "function") {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }, 10 * 60_000);
  // Do not keep the process alive for this.
  if (typeof timer === "object" && "unref" in timer) timer.unref();
}
