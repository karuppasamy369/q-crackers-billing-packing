import { describe, it, expect } from "vitest";
import {
  generateSessionToken,
  hashSessionToken,
  safeHashEquals,
  generateRandomToken,
  sha256Hex,
} from "./tokens";

describe("session tokens", () => {
  it("generates high-entropy, unique, url-safe tokens", () => {
    const tokens = new Set(
      Array.from({ length: 500 }, () => generateSessionToken()),
    );
    expect(tokens.size).toBe(500);
    for (const t of tokens) {
      expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
      // 32 bytes -> 43 base64url chars
      expect(t.length).toBeGreaterThanOrEqual(43);
    }
  });

  it("hashes deterministically to 64 hex chars and hides the raw token", () => {
    const raw = generateSessionToken();
    const h1 = hashSessionToken(raw);
    const h2 = hashSessionToken(raw);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h1).not.toContain(raw);
  });

  it("safeHashEquals compares hashes correctly", () => {
    const a = sha256Hex("alpha");
    const b = sha256Hex("alpha");
    const c = sha256Hex("beta");
    expect(safeHashEquals(a, b)).toBe(true);
    expect(safeHashEquals(a, c)).toBe(false);
    expect(safeHashEquals(a, "abc")).toBe(false);
  });

  it("generateRandomToken respects the byte length", () => {
    expect(generateRandomToken(16).length).toBeGreaterThanOrEqual(22);
    expect(generateRandomToken(32).length).toBeGreaterThanOrEqual(43);
    expect(generateRandomToken(48)).not.toBe(generateRandomToken(48));
  });
});
