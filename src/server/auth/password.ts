import { hash, verify } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";

/**
 * Password hashing — Argon2id.
 *
 * Parameters follow current OWASP guidance (>= 19 MiB memory, >= 2 iterations).
 * `@node-rs/argon2` ships prebuilt native binaries, so there is no node-gyp
 * build step on any platform.
 */
const ARGON2_OPTIONS = {
  // 19 MiB
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/** Minimum acceptable password length for internal accounts. */
export const MIN_PASSWORD_LENGTH = 12;

export async function hashPassword(plain: string): Promise<string> {
  if (typeof plain !== "string" || plain.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }
  return hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(
  storedHash: string,
  plain: string,
): Promise<boolean> {
  if (!storedHash || !plain) return false;
  try {
    return await verify(storedHash, plain);
  } catch {
    // Malformed hash, etc. Treat as a failed verification, never throw here.
    return false;
  }
}

/**
 * Generate a strong, human-typeable temporary password for a new account or a
 * partner-initiated reset. The account is always flagged `mustChangePassword`.
 */
export function generateTemporaryPassword(): string {
  // Avoid ambiguous characters (0/O, 1/l/I).
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(20);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  // Group for readability: xxxxx-xxxxx-xxxxx-xxxxx
  return out.replace(/(.{5})(?=.)/g, "$1-");
}
