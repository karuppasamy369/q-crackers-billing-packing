import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit, _resetRateLimits } from "./rate-limit";

describe("rateLimit", () => {
  beforeEach(() => _resetRateLimits());

  it("allows up to the limit then blocks", () => {
    const key = "test:a";
    for (let i = 0; i < 3; i++) {
      expect(rateLimit(key, 3, 1000).allowed).toBe(true);
    }
    const blocked = rateLimit(key, 3, 1000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("tracks buckets independently by key", () => {
    expect(rateLimit("k1", 1, 1000).allowed).toBe(true);
    expect(rateLimit("k1", 1, 1000).allowed).toBe(false);
    expect(rateLimit("k2", 1, 1000).allowed).toBe(true);
  });

  it("resets after the window elapses", async () => {
    expect(rateLimit("w", 1, 20).allowed).toBe(true);
    expect(rateLimit("w", 1, 20).allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 30));
    expect(rateLimit("w", 1, 20).allowed).toBe(true);
  });
});
