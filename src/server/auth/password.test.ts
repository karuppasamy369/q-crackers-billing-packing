import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  generateTemporaryPassword,
  MIN_PASSWORD_LENGTH,
} from "./password";

describe("password hashing", () => {
  it("produces an argon2id hash that is not the plaintext", async () => {
    const hash = await hashPassword("Correct-Horse-Battery-9");
    expect(hash).not.toContain("Correct-Horse-Battery-9");
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });

  it("verifies a correct password and rejects a wrong one", async () => {
    const hash = await hashPassword("Correct-Horse-Battery-9");
    expect(await verifyPassword(hash, "Correct-Horse-Battery-9")).toBe(true);
    expect(await verifyPassword(hash, "wrong-password-123")).toBe(false);
  });

  it("salts: the same password hashes differently each time", async () => {
    const a = await hashPassword("Correct-Horse-Battery-9");
    const b = await hashPassword("Correct-Horse-Battery-9");
    expect(a).not.toBe(b);
  });

  it("rejects short passwords", async () => {
    await expect(hashPassword("short")).rejects.toThrow();
  });

  it("verifyPassword never throws on malformed input", async () => {
    expect(await verifyPassword("not-a-hash", "x")).toBe(false);
    expect(await verifyPassword("", "")).toBe(false);
  });

  it("generateTemporaryPassword is long, unique, and meets the length policy", () => {
    const a = generateTemporaryPassword();
    const b = generateTemporaryPassword();
    expect(a).not.toBe(b);
    expect(a.replace(/-/g, "").length).toBeGreaterThanOrEqual(
      MIN_PASSWORD_LENGTH,
    );
  });
});
