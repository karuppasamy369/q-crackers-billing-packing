/**
 * Integration tests — require a real PostgreSQL database.
 *
 * They are SKIPPED automatically unless TEST_DATABASE_URL is set. CI provides a
 * Postgres service, runs `prisma migrate deploy` and `npm run db:seed`, then
 * runs these. To run locally:
 *
 *   docker compose up -d
 *   TEST_DATABASE_URL=postgresql://qcrackers:qcrackers@localhost:5432/qcrackers \
 *     npx prisma migrate deploy && npm run db:seed && npm test
 */
import { describe, it, expect } from "vitest";
import { db as prisma, TEST_DB } from "./_context";
import {
  resolveEffectivePermissions,
  type PermissionOverride,
} from "@/lib/rbac/resolve";
import type { PermissionKey, RoleKey } from "@/lib/rbac/permissions";
import { PERMISSION_KEYS } from "@/lib/rbac/permissions";

const d = TEST_DB ? describe : describe.skip;

async function effectivePermissionsFor(
  code: string,
): Promise<Set<PermissionKey>> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { code },
    include: {
      role: true,
      permissionOverrides: { include: { permission: true } },
    },
  });
  const roleGrants = (
    await prisma.rolePermission.findMany({
      where: { roleId: user.roleId },
      include: { permission: true },
    })
  ).map((r) => r.permission.key as PermissionKey);
  const overrides: PermissionOverride[] = user.permissionOverrides.map((o) => ({
    permission: o.permission.key as PermissionKey,
    effect: o.effect,
  }));
  return resolveEffectivePermissions({
    role: user.role.key as RoleKey,
    roleGrants,
    overrides,
  });
}

d("schema + seed", () => {
  it("creates the five internal accounts with the right codes and roles", async () => {
    const users = await prisma.user.findMany({
      include: { role: true },
      orderBy: { code: "asc" },
    });
    const roleOf = (code: string) =>
      users.find((u) => u.code === code)?.role.key;

    expect(users.map((u) => u.code)).toEqual(["P1", "P2", "P3", "S1", "S2"]);
    expect(roleOf("P1")).toBe("PARTNER");
    expect(roleOf("P2")).toBe("PARTNER");
    expect(roleOf("P3")).toBe("PARTNER");
    expect(roleOf("S1")).toBe("STAFF");
    expect(roleOf("S2")).toBe("STAFF");

    for (const u of users) {
      expect(u.mustChangePassword).toBe(true);
      expect(u.passwordHash.startsWith("$argon2id$")).toBe(true);
      expect(u.passwordHash).not.toContain("Pass");
      expect(u.isActive).toBe(true);
    }
  });

  it("syncs the full permission catalogue", async () => {
    const perms = await prisma.permission.findMany();
    expect(new Set(perms.map((p) => p.key))).toEqual(new Set(PERMISSION_KEYS));
  });

  it("grants partners every permission", async () => {
    const eff = await effectivePermissionsFor("P1");
    expect(eff.size).toBe(PERMISSION_KEYS.length);
  });

  it("gives staff a restricted set without any admin or destructive permission", async () => {
    const eff = await effectivePermissionsFor("S1");

    expect(eff.has("booking.pack")).toBe(true);
    expect(eff.has("billing.create")).toBe(true);
    expect(eff.has("orders.view")).toBe(true);

    for (const forbidden of [
      "staff.manage",
      "settings.manage",
      "audit.view_all",
      "products.manage",
      "prices.manage",
      "orders.cancel",
      "orders.override_state",
      "payments.confirm_manual",
      "billing.cancel",
    ] as PermissionKey[]) {
      expect(eff.has(forbidden)).toBe(false);
    }
    expect(eff.size).toBeLessThan(PERMISSION_KEYS.length);
  });

  it("re-running the seed is idempotent (no duplicate users/permissions)", async () => {
    expect(await prisma.user.count()).toBe(5);
    expect(await prisma.permission.count()).toBe(PERMISSION_KEYS.length);
    expect(await prisma.role.count()).toBe(2);
  });
});

d("audit_logs is append-only", () => {
  it("allows INSERT but rejects UPDATE and DELETE at the database level", async () => {
    const row = await prisma.auditLog.create({
      data: {
        action: "test.append_only",
        actorRole: "SYSTEM",
        summary: "integration probe",
      },
    });

    await expect(
      prisma.auditLog.update({
        where: { id: row.id },
        data: { summary: "tampered" },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.auditLog.delete({ where: { id: row.id } }),
    ).rejects.toThrow();

    const still = await prisma.auditLog.findUnique({ where: { id: row.id } });
    expect(still?.summary).toBe("integration probe");
  });
});
