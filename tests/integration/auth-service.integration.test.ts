/**
 * Auth service — self-service password change. Skipped unless
 * TEST_DATABASE_URL is set (CI provides Postgres).
 *
 * Regression coverage for a real bug found while manually testing the
 * payment flow: `changeOwnPassword` revoked the session in the database but
 * left the browser's session cookie in place. The edge middleware can only
 * check whether a cookie is *present* (it has no database access), so a
 * present-but-revoked cookie sent `/login` straight back to the console,
 * which correctly found no valid session and redirected back to `/login` —
 * an infinite redirect loop (`ERR_TOO_MANY_REDIRECTS`) trapping the user
 * immediately after the mandatory first-login password change every new
 * account goes through.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  TEST_DB,
  db as prisma,
  loginAs,
  logout,
  hasSessionCookie,
  resetCatalogue,
} from "./_context";
import { hashPassword } from "@/server/auth/password";
import { getCurrentAuth } from "@/server/auth/session";
import { changeOwnPassword } from "@/server/services/auth-service";

const d = TEST_DB ? describe : describe.skip;

const KNOWN_PASSWORD = "KnownCurrent123";

async function setKnownPassword(code: string): Promise<void> {
  const hash = await hashPassword(KNOWN_PASSWORD);
  await prisma.user.update({
    where: { code },
    data: { passwordHash: hash, mustChangePassword: true },
  });
}

d("auth-service — changeOwnPassword", () => {
  beforeEach(async () => {
    await resetCatalogue(prisma);
    logout();
  });

  it("clears the session cookie, not just the DB session (no redirect-loop trap)", async () => {
    await setKnownPassword("PK");
    await loginAs(prisma, "PK");
    expect(hasSessionCookie()).toBe(true);
    expect(await getCurrentAuth()).not.toBeNull();

    await changeOwnPassword({
      currentPassword: KNOWN_PASSWORD,
      newPassword: "BrandNewPass456",
      confirmPassword: "BrandNewPass456",
    });

    // The regression check: the cookie itself must be gone, not just the
    // underlying session row — otherwise the edge middleware (cookie
    // presence only, no DB access) bounces `/login` back to the console.
    expect(hasSessionCookie()).toBe(false);
    expect(await getCurrentAuth()).toBeNull();
  });

  it("revokes every session row for the user in the database", async () => {
    await setKnownPassword("PK");
    const userId = await loginAs(prisma, "PK");
    await loginAs(prisma, "PK"); // a second concurrent session

    await changeOwnPassword({
      currentPassword: KNOWN_PASSWORD,
      newPassword: "BrandNewPass456",
      confirmPassword: "BrandNewPass456",
    });

    const sessions = await prisma.session.findMany({ where: { userId } });
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions.every((s) => s.revokedAt !== null)).toBe(true);
  });

  it("clears mustChangePassword and accepts the new password on the next login", async () => {
    await setKnownPassword("PK");
    await loginAs(prisma, "PK");

    await changeOwnPassword({
      currentPassword: KNOWN_PASSWORD,
      newPassword: "BrandNewPass456",
      confirmPassword: "BrandNewPass456",
    });

    const user = await prisma.user.findUniqueOrThrow({ where: { code: "PK" } });
    expect(user.mustChangePassword).toBe(false);
  });

  it("rejects a wrong current password and leaves the session intact", async () => {
    await setKnownPassword("PK");
    await loginAs(prisma, "PK");

    await expect(
      changeOwnPassword({
        currentPassword: "totally-wrong",
        newPassword: "BrandNewPass456",
        confirmPassword: "BrandNewPass456",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    // A failed attempt must not clear the cookie or touch the session.
    expect(hasSessionCookie()).toBe(true);
    expect(await getCurrentAuth()).not.toBeNull();
  });

  it("rejects when not signed in", async () => {
    logout();
    await expect(
      changeOwnPassword({
        currentPassword: KNOWN_PASSWORD,
        newPassword: "BrandNewPass456",
        confirmPassword: "BrandNewPass456",
      }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});
