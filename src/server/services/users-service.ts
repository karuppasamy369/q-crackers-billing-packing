import "server-only";

import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma";
import {
  hashPassword,
  generateTemporaryPassword,
} from "@/server/auth/password";
import { requirePermission } from "@/server/rbac/authorize";
import { revokeAllSessionsForUser, revokeSession } from "@/server/auth/session";
import { recordAudit, type AuditActor } from "@/server/services/audit";
import { getRequestContext } from "@/server/http/request-context";
import { AppError, NotFoundError, ValidationError } from "@/server/http/errors";
import type { AuthContext } from "@/server/auth/session";
import {
  createUserSchema,
  setActiveSchema,
  setOverrideSchema,
  removeOverrideSchema,
  revokeSessionSchema,
  userIdSchema,
} from "@/lib/validation/users";
import { roleDefaultPermissions, type RoleKey } from "@/lib/rbac/permissions";

function actorFrom(auth: AuthContext): AuditActor {
  return {
    kind: "user",
    userId: auth.user.id,
    code: auth.user.code,
    role: auth.user.role,
  };
}

async function nextUserCode(role: RoleKey): Promise<string> {
  const prefix = role === "PARTNER" ? "P" : "S";
  const existing = await db.user.findMany({
    where: { code: { startsWith: prefix } },
    select: { code: true },
  });
  let max = 0;
  for (const { code } of existing) {
    const n = Number.parseInt(code.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${max + 1}`;
}

export async function listUsers() {
  await requirePermission("staff.manage");
  const users = await db.user.findMany({
    orderBy: [{ role: { key: "asc" } }, { code: "asc" }],
    include: {
      role: true,
      _count: { select: { permissionOverrides: true } },
    },
  });
  const now = new Date();
  const withSessions = await Promise.all(
    users.map(async (u) => ({
      ...u,
      activeSessions: await db.session.count({
        where: { userId: u.id, revokedAt: null, expiresAt: { gt: now } },
      }),
    })),
  );
  return withSessions;
}

export async function getUserDetail(rawUserId: string) {
  await requirePermission("staff.manage");
  const { userId } = userIdSchema.parse({ userId: rawUserId });
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      role: true,
      permissionOverrides: {
        include: { permission: true, createdBy: { select: { code: true } } },
        orderBy: { createdAt: "desc" },
      },
      sessions: {
        where: { revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { lastUsedAt: "desc" },
      },
    },
  });
  if (!user) throw new NotFoundError("That account does not exist.");
  return user;
}

export async function createUser(
  raw: unknown,
): Promise<{ code: string; temporaryPassword: string }> {
  const auth = await requirePermission("staff.manage");
  const input = createUserSchema.parse(raw);
  const ctx = await getRequestContext();

  const existing = await db.user.findUnique({ where: { email: input.email } });
  if (existing) throw new ValidationError("That email is already in use.");

  const role = await db.role.findUnique({ where: { key: input.role } });
  if (!role) throw new AppError("INTERNAL", "Role configuration is missing.");

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  // Retry once on the (unlikely) race for the same generated code.
  let created;
  for (let attempt = 0; attempt < 2; attempt++) {
    const code = await nextUserCode(input.role);
    try {
      created = await db.user.create({
        data: {
          code,
          name: input.name,
          email: input.email,
          passwordHash,
          roleId: role.id,
          mustChangePassword: true,
        },
      });
      break;
    } catch (e) {
      const err = e as Prisma.PrismaClientKnownRequestError;
      if (err.code === "P2002" && attempt === 0) continue;
      throw e;
    }
  }
  if (!created)
    throw new AppError("CONFLICT", "Could not allocate a user code.");

  await recordAudit(
    actorFrom(auth),
    {
      action: "user.create",
      summary: `${auth.user.code} created account ${created.code} (${input.role})`,
      entityType: "User",
      entityId: created.id,
      details: { code: created.code, email: input.email, role: input.role },
    },
    ctx,
  );

  return { code: created.code, temporaryPassword };
}

export async function setUserActive(raw: unknown): Promise<void> {
  const auth = await requirePermission("staff.manage");
  const { userId, active } = setActiveSchema.parse(raw);
  const ctx = await getRequestContext();

  if (userId === auth.user.id) {
    throw new ValidationError("You cannot change your own account status.");
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    include: { role: true },
  });
  if (!user) throw new NotFoundError("That account does not exist.");

  if (!active && user.role.key === "PARTNER") {
    const otherActivePartners = await db.user.count({
      where: {
        role: { key: "PARTNER" },
        isActive: true,
        id: { not: userId },
      },
    });
    if (otherActivePartners === 0) {
      throw new ValidationError(
        "At least one partner account must remain active.",
      );
    }
  }

  if (user.isActive === active) return;

  await db.user.update({ where: { id: userId }, data: { isActive: active } });
  let revoked = 0;
  if (!active) {
    revoked = await revokeAllSessionsForUser(userId, auth.user.id);
  }

  await recordAudit(
    actorFrom(auth),
    {
      action: active ? "user.reactivate" : "user.deactivate",
      summary: `${auth.user.code} ${active ? "reactivated" : "deactivated"} ${user.code}`,
      entityType: "User",
      entityId: userId,
      details: { sessionsRevoked: revoked },
    },
    ctx,
  );
}

export async function resetUserPassword(
  raw: unknown,
): Promise<{ temporaryPassword: string }> {
  const auth = await requirePermission("staff.manage");
  const { userId } = userIdSchema.parse(raw);
  const ctx = await getRequestContext();

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError("That account does not exist.");

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  await db.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      mustChangePassword: true,
      passwordChangedAt: new Date(),
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });
  const revoked = await revokeAllSessionsForUser(userId, auth.user.id);

  await recordAudit(
    actorFrom(auth),
    {
      action: "user.password_reset",
      summary: `${auth.user.code} reset the password for ${user.code}`,
      entityType: "User",
      entityId: userId,
      details: { sessionsRevoked: revoked },
    },
    ctx,
  );

  return { temporaryPassword };
}

export async function setPermissionOverride(raw: unknown): Promise<void> {
  const auth = await requirePermission("staff.manage");
  const input = setOverrideSchema.parse(raw);
  const ctx = await getRequestContext();

  const user = await db.user.findUnique({
    where: { id: input.userId },
    include: { role: true },
  });
  if (!user) throw new NotFoundError("That account does not exist.");

  if (user.role.key === "PARTNER") {
    throw new ValidationError(
      "Partner accounts always have full access; overrides are not allowed.",
    );
  }

  // A DENY on something the STAFF role does not grant, or an ALLOW on
  // something it already grants, is a no-op — reject to keep the list clean.
  const roleGrants = new Set(roleDefaultPermissions("STAFF"));
  if (input.effect === "ALLOW" && roleGrants.has(input.permission)) {
    throw new ValidationError("Staff already have this permission by default.");
  }
  if (input.effect === "DENY" && !roleGrants.has(input.permission)) {
    throw new ValidationError("Staff do not have this permission to revoke.");
  }

  const permission = await db.permission.findUnique({
    where: { key: input.permission },
  });
  if (!permission) throw new AppError("INTERNAL", "Unknown permission.");

  await db.userPermission.upsert({
    where: {
      userId_permissionId: {
        userId: input.userId,
        permissionId: permission.id,
      },
    },
    create: {
      userId: input.userId,
      permissionId: permission.id,
      effect: input.effect,
      note: input.note ?? null,
      createdById: auth.user.id,
    },
    update: {
      effect: input.effect,
      note: input.note ?? null,
      createdById: auth.user.id,
    },
  });

  await recordAudit(
    actorFrom(auth),
    {
      action: "user.permission_override_set",
      summary: `${auth.user.code} set ${input.effect} ${input.permission} for ${user.code}`,
      entityType: "User",
      entityId: input.userId,
      details: {
        permission: input.permission,
        effect: input.effect,
        note: input.note ?? null,
      },
    },
    ctx,
  );
}

export async function removePermissionOverride(raw: unknown): Promise<void> {
  const auth = await requirePermission("staff.manage");
  const input = removeOverrideSchema.parse(raw);
  const ctx = await getRequestContext();

  const permission = await db.permission.findUnique({
    where: { key: input.permission },
  });
  if (!permission) throw new AppError("INTERNAL", "Unknown permission.");

  const user = await db.user.findUnique({ where: { id: input.userId } });
  if (!user) throw new NotFoundError("That account does not exist.");

  await db.userPermission
    .delete({
      where: {
        userId_permissionId: {
          userId: input.userId,
          permissionId: permission.id,
        },
      },
    })
    .catch(() => undefined);

  await recordAudit(
    actorFrom(auth),
    {
      action: "user.permission_override_removed",
      summary: `${auth.user.code} removed the ${input.permission} override for ${user.code}`,
      entityType: "User",
      entityId: input.userId,
      details: { permission: input.permission },
    },
    ctx,
  );
}

export async function revokeUserSession(raw: unknown): Promise<void> {
  const auth = await requirePermission("staff.manage");
  const { userId, sessionId } = revokeSessionSchema.parse(raw);
  const ctx = await getRequestContext();

  const session = await db.session.findUnique({ where: { id: sessionId } });
  if (!session || session.userId !== userId) {
    throw new NotFoundError("That session does not exist.");
  }

  await revokeSession(sessionId, auth.user.id);

  await recordAudit(
    actorFrom(auth),
    {
      action: "session.revoke",
      summary: `${auth.user.code} revoked a session`,
      entityType: "Session",
      entityId: sessionId,
      details: { targetUserId: userId },
    },
    ctx,
  );
}
