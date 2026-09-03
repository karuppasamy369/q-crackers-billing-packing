import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { db } from "@/server/db";
import { env, isProduction } from "@/env";
import { logger } from "@/lib/logger";
import { generateSessionToken, hashSessionToken } from "@/server/auth/tokens";
import {
  resolveEffectivePermissions,
  type PermissionOverride,
} from "@/lib/rbac/resolve";
import type { PermissionKey, RoleKey } from "@/lib/rbac/permissions";
import type { RequestContext } from "@/server/services/audit";
import { SESSION_COOKIE } from "@/lib/auth/cookie";

export { SESSION_COOKIE };

const IDLE_MS = env.SESSION_IDLE_TIMEOUT_MINUTES * 60_000;
const ABSOLUTE_MS = env.SESSION_ABSOLUTE_TIMEOUT_HOURS * 3_600_000;
/** Only bump the DB idle expiry at most this often, to avoid a write per hit. */
const RENEW_THROTTLE_MS = 5 * 60_000;

export type AuthUser = {
  id: string;
  code: string;
  name: string;
  email: string;
  role: RoleKey;
  isActive: boolean;
  mustChangePassword: boolean;
};

export type AuthContext = {
  user: AuthUser;
  sessionId: string;
  permissions: ReadonlySet<PermissionKey>;
};

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/**
 * Create a session for `userId` and attach the cookie.
 * MUST be called from a Server Action or Route Handler (it writes a cookie).
 */
export async function createSession(
  userId: string,
  ctx: RequestContext = {},
): Promise<void> {
  const rawToken = generateSessionToken();
  const now = Date.now();

  await db.session.create({
    data: {
      userId,
      tokenHash: hashSessionToken(rawToken),
      expiresAt: new Date(now + IDLE_MS),
      absoluteExpiresAt: new Date(now + ABSOLUTE_MS),
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ? ctx.userAgent.slice(0, 512) : null,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(
    SESSION_COOKIE,
    rawToken,
    cookieOptions(Math.floor(ABSOLUTE_MS / 1000)),
  );
}

/**
 * Resolve the current request's auth context, or null if unauthenticated.
 * Safe to call from React Server Components — it only writes to the DB
 * (idle-expiry renewal), never to cookies.
 *
 * Memoised per-request with React `cache` so multiple layouts/pages calling it
 * share one DB round-trip.
 */
export const getCurrentAuth = cache(async (): Promise<AuthContext | null> => {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (!rawToken) return null;

  const tokenHash = hashSessionToken(rawToken);
  const session = await db.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: {
          role: true,
          permissionOverrides: { include: { permission: true } },
        },
      },
    },
  });

  if (!session || session.revokedAt) return null;

  const now = new Date();
  if (session.expiresAt <= now || session.absoluteExpiresAt <= now) return null;
  if (!session.user.isActive) return null;

  // Sliding idle renewal (throttled, capped at the absolute expiry).
  if (now.getTime() - session.lastUsedAt.getTime() > RENEW_THROTTLE_MS) {
    const nextExpiry = new Date(
      Math.min(now.getTime() + IDLE_MS, session.absoluteExpiresAt.getTime()),
    );
    try {
      await db.session.update({
        where: { id: session.id },
        data: { lastUsedAt: now, expiresAt: nextExpiry },
      });
    } catch (err) {
      logger.warn("session.renew_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const role = session.user.role.key as RoleKey;
  const overrides: PermissionOverride[] = session.user.permissionOverrides.map(
    (o) => ({
      permission: o.permission.key as PermissionKey,
      effect: o.effect,
    }),
  );

  const roleGrants = await loadRoleGrants(session.user.roleId);
  const permissions = resolveEffectivePermissions({
    role,
    roleGrants,
    overrides,
  });

  return {
    user: {
      id: session.user.id,
      code: session.user.code,
      name: session.user.name,
      email: session.user.email,
      role,
      isActive: session.user.isActive,
      mustChangePassword: session.user.mustChangePassword,
    },
    sessionId: session.id,
    permissions,
  };
});

const loadRoleGrants = cache(
  async (roleId: string): Promise<PermissionKey[]> => {
    const rows = await db.rolePermission.findMany({
      where: { roleId },
      include: { permission: true },
    });
    return rows.map((r) => r.permission.key as PermissionKey);
  },
);

/** Revoke the current request's session and clear its cookie. */
export async function destroyCurrentSession(
  revokedById?: string,
): Promise<void> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (rawToken) {
    const tokenHash = hashSessionToken(rawToken);
    await db.session
      .updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date(), revokedById: revokedById ?? null },
      })
      .catch(() => undefined);
  }
  cookieStore.delete(SESSION_COOKIE);
}

/** Revoke one session by id (used by staff management). */
export async function revokeSession(
  sessionId: string,
  revokedById: string,
): Promise<void> {
  await db.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date(), revokedById },
  });
}

/** Revoke every active session for a user (deactivation, password reset). */
export async function revokeAllSessionsForUser(
  userId: string,
  revokedById: string | null,
): Promise<number> {
  const res = await db.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date(), revokedById },
  });
  return res.count;
}
