import "server-only";

import { db } from "@/server/db";
import { env } from "@/env";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import {
  createSession,
  destroyCurrentSession,
  getCurrentAuth,
  revokeAllSessionsForUser,
} from "@/server/auth/session";
import { recordAudit } from "@/server/services/audit";
import { getRequestContext } from "@/server/http/request-context";
import {
  AppError,
  UnauthenticatedError,
  ValidationError,
} from "@/server/http/errors";
import { loginSchema, changePasswordSchema } from "@/lib/validation/auth";

const GENERIC_LOGIN_ERROR = "Incorrect email or password.";

// Equalises response timing when the email does not exist, so an attacker
// cannot enumerate accounts by measuring latency.
const dummyHashPromise = hashPassword("d0-not-use__timing-equaliser");

export type LoginResult = { ok: true } | { ok: false; message: string };

export async function login(raw: unknown): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: GENERIC_LOGIN_ERROR };
  }
  const { email, password } = parsed.data;
  const ctx = await getRequestContext();

  const ipKey = `login:ip:${ctx.ip ?? "unknown"}`;
  const idKey = `login:id:${email}`;
  const ipLimit = rateLimit(ipKey, env.LOGIN_MAX_ATTEMPTS * 4, 15 * 60_000);
  const idLimit = rateLimit(idKey, env.LOGIN_MAX_ATTEMPTS + 2, 15 * 60_000);
  if (!ipLimit.allowed || !idLimit.allowed) {
    return {
      ok: false,
      message: "Too many attempts. Please wait a few minutes and try again.",
    };
  }

  const user = await db.user.findUnique({
    where: { email },
    include: { role: true },
  });

  if (!user) {
    // Burn comparable CPU time, then fail generically.
    await verifyPassword(await dummyHashPromise, password);
    await recordAudit(
      { kind: "system" },
      {
        action: "auth.login_failed",
        summary: `Failed login for unknown email ${email}`,
        entityType: "User",
        details: { email, reason: "unknown_email" },
      },
      ctx,
    );
    return { ok: false, message: GENERIC_LOGIN_ERROR };
  }

  const actor = {
    kind: "user" as const,
    userId: user.id,
    code: user.code,
    role: user.role.key,
  };

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await recordAudit(
      actor,
      {
        action: "auth.login_blocked",
        summary: `Login blocked for ${user.code}: account locked`,
        entityType: "User",
        entityId: user.id,
        details: { reason: "locked", lockedUntil: user.lockedUntil },
      },
      ctx,
    );
    return {
      ok: false,
      message: "This account is temporarily locked. Try again later.",
    };
  }

  const passwordOk = await verifyPassword(user.passwordHash, password);

  if (!passwordOk || !user.isActive) {
    const attempts = user.isActive
      ? user.failedLoginAttempts + 1
      : user.failedLoginAttempts;
    const shouldLock = attempts >= env.LOGIN_MAX_ATTEMPTS;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil: shouldLock
          ? new Date(Date.now() + env.LOGIN_LOCKOUT_MINUTES * 60_000)
          : user.lockedUntil,
      },
    });
    await recordAudit(
      actor,
      {
        action: "auth.login_failed",
        summary: `Failed login for ${user.code}`,
        entityType: "User",
        entityId: user.id,
        details: {
          reason: !user.isActive ? "inactive" : "bad_password",
          failedAttempts: attempts,
          locked: shouldLock,
        },
      },
      ctx,
    );
    return { ok: false, message: GENERIC_LOGIN_ERROR };
  }

  // Success.
  await db.user.update({
    where: { id: user.id },
    data: {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    },
  });
  await createSession(user.id, ctx);
  await recordAudit(
    actor,
    {
      action: "auth.login",
      summary: `${user.code} signed in`,
      entityType: "User",
      entityId: user.id,
    },
    ctx,
  );
  logger.info("auth.login", { code: user.code });
  return { ok: true };
}

export async function logout(): Promise<void> {
  const auth = await getCurrentAuth();
  const ctx = await getRequestContext();
  await destroyCurrentSession(auth?.user.id);
  if (auth) {
    await recordAudit(
      {
        kind: "user",
        userId: auth.user.id,
        code: auth.user.code,
        role: auth.user.role,
      },
      {
        action: "auth.logout",
        summary: `${auth.user.code} signed out`,
        entityType: "User",
        entityId: auth.user.id,
      },
      ctx,
    );
  }
}

export async function changeOwnPassword(raw: unknown): Promise<void> {
  const auth = await getCurrentAuth();
  if (!auth) throw new UnauthenticatedError();

  const parsed = changePasswordSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "The submitted data is invalid.",
    );
  }

  const user = await db.user.findUnique({ where: { id: auth.user.id } });
  if (!user) throw new UnauthenticatedError();

  const currentOk = await verifyPassword(
    user.passwordHash,
    parsed.data.currentPassword,
  );
  if (!currentOk) {
    throw new AppError("VALIDATION", "Your current password is incorrect.");
  }

  const newHash = await hashPassword(parsed.data.newPassword);
  const ctx = await getRequestContext();

  await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash: newHash,
      mustChangePassword: false,
      passwordChangedAt: new Date(),
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });

  // Invalidate every session, including this one, forcing a fresh sign-in
  // everywhere. `destroyCurrentSession` also clears this browser's cookie —
  // without that, the cookie stays present-but-revoked, and the edge
  // middleware (which can only check cookie *presence*, not validity) bounces
  // `/login` straight back to the console, which then redirects back to
  // `/login`, forever.
  await revokeAllSessionsForUser(user.id, user.id);
  await destroyCurrentSession(user.id);

  await recordAudit(
    {
      kind: "user",
      userId: user.id,
      code: user.code,
      role: auth.user.role,
    },
    {
      action: "auth.password_changed",
      summary: `${user.code} changed their password`,
      entityType: "User",
      entityId: user.id,
    },
    ctx,
  );
}
