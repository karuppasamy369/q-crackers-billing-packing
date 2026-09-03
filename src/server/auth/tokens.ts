import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Opaque session tokens.
 *
 * - The raw token is 256 bits of CSPRNG output, base64url-encoded.
 * - Only its SHA-256 hash is stored in the database. A database leak therefore
 *   does not expose usable session tokens.
 * - Lookups compare hashes with a constant-time comparison.
 */
const TOKEN_BYTES = 32;

export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashSessionToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/** Constant-time comparison of two hex-encoded hashes of equal length. */
export function safeHashEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

/**
 * Generic cryptographically-secure random token generator, used later for
 * tracking tokens, review links, etc. Kept here so there is a single audited
 * source of randomness.
 */
export function generateRandomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
