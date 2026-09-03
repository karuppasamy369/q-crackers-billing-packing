import { describe, it, expect } from "vitest";
import { loginSchema, changePasswordSchema } from "./auth";

describe("loginSchema", () => {
  it("normalises the email and accepts any non-empty password", () => {
    const parsed = loginSchema.parse({
      email: "  Partner1@QCrackers.Local ",
      password: "whatever",
    });
    expect(parsed.email).toBe("partner1@qcrackers.local");
  });

  it("rejects a malformed email or an empty password", () => {
    expect(
      loginSchema.safeParse({ email: "nope", password: "x" }).success,
    ).toBe(false);
    expect(
      loginSchema.safeParse({ email: "a@b.com", password: "" }).success,
    ).toBe(false);
  });
});

describe("changePasswordSchema", () => {
  const base = {
    currentPassword: "old-Password-1",
    newPassword: "New-Password-42",
    confirmPassword: "New-Password-42",
  };

  it("accepts a strong, confirmed, changed password", () => {
    expect(changePasswordSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a weak new password", () => {
    expect(
      changePasswordSchema.safeParse({
        ...base,
        newPassword: "alllowercase",
        confirmPassword: "alllowercase",
      }).success,
    ).toBe(false);
  });

  it("rejects a mismatched confirmation", () => {
    expect(
      changePasswordSchema.safeParse({
        ...base,
        confirmPassword: "Different-99",
      }).success,
    ).toBe(false);
  });

  it("rejects reusing the current password", () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: "New-Password-42",
        newPassword: "New-Password-42",
        confirmPassword: "New-Password-42",
      }).success,
    ).toBe(false);
  });
});
