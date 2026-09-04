import { describe, it, expect } from "vitest";
import { hashTrackingToken } from "./tracking-service";
import { generateRandomToken } from "@/server/auth/tokens";

describe("hashTrackingToken", () => {
  it("produces a 64-char lower-case hex SHA-256 digest", () => {
    const h = hashTrackingToken("some-raw-token");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic and not the identity function", () => {
    const raw = generateRandomToken(32);
    expect(hashTrackingToken(raw)).toBe(hashTrackingToken(raw));
    expect(hashTrackingToken(raw)).not.toBe(raw);
  });

  it("is collision-free and well distributed for random inputs", () => {
    const hashes = new Set<string>();
    for (let i = 0; i < 500; i++)
      hashes.add(hashTrackingToken(generateRandomToken(32)));
    expect(hashes.size).toBe(500);
  });
});

describe("raw tracking token entropy", () => {
  it("32 CSPRNG bytes → 43-char base64url, unique across a large sample", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const tok = generateRandomToken(32);
      expect(tok).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes, no padding
      seen.add(tok);
    }
    expect(seen.size).toBe(2000);
  });
});
