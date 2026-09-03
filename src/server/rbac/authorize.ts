import "server-only";

import { getCurrentAuth, type AuthContext } from "@/server/auth/session";
import { ForbiddenError, UnauthenticatedError } from "@/server/http/errors";
import { logger } from "@/lib/logger";
import type { PermissionKey } from "@/lib/rbac/permissions";
import { canAll, canAny } from "@/lib/rbac/resolve";

/**
 * Server-side authorization guards.
 *
 * Every mutating Server Action and every protected Route Handler MUST call one
 * of these. Hiding UI in the client is not a security control — this is.
 */

export async function requireAuth(): Promise<AuthContext> {
  const auth = await getCurrentAuth();
  if (!auth) throw new UnauthenticatedError();
  return auth;
}

export async function requirePermission(
  permission: PermissionKey,
): Promise<AuthContext> {
  const auth = await requireAuth();
  if (!auth.permissions.has(permission)) {
    logger.warn("authz.denied", {
      userId: auth.user.id,
      code: auth.user.code,
      permission,
    });
    throw new ForbiddenError();
  }
  return auth;
}

export async function requireAllPermissions(
  permissions: PermissionKey[],
): Promise<AuthContext> {
  const auth = await requireAuth();
  if (!canAll(auth.permissions, permissions)) {
    logger.warn("authz.denied", {
      userId: auth.user.id,
      code: auth.user.code,
      permissions,
    });
    throw new ForbiddenError();
  }
  return auth;
}

export async function requireAnyPermission(
  permissions: PermissionKey[],
): Promise<AuthContext> {
  const auth = await requireAuth();
  if (!canAny(auth.permissions, permissions)) {
    logger.warn("authz.denied", {
      userId: auth.user.id,
      code: auth.user.code,
      permissions,
    });
    throw new ForbiddenError();
  }
  return auth;
}

/** Non-throwing check, for conditionally rendering UI. */
export function hasPermission(
  auth: AuthContext,
  permission: PermissionKey,
): boolean {
  return auth.permissions.has(permission);
}
