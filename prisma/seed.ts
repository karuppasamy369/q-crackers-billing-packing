/**
 * Seed: roles, the permission catalogue, role defaults, and the five initial
 * internal accounts.
 *
 * Idempotent — safe to run repeatedly. Existing users are never modified
 * (their passwords are left alone); only missing rows are created.
 *
 * Run with:  npm run db:seed
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/index.js";
import {
  hashPassword,
  generateTemporaryPassword,
} from "../src/server/auth/password";
import {
  PERMISSIONS,
  PERMISSION_KEYS,
  STAFF_DEFAULT_PERMISSIONS,
  partnerPermissions,
} from "../src/lib/rbac/permissions";

const prisma = new PrismaClient();

type SeedUser = {
  code: string;
  name: string;
  role: "PARTNER" | "STAFF";
  emailEnv: string;
  passwordEnv: string;
  defaultEmail: string;
};

const SEED_USERS: SeedUser[] = [
  {
    code: "P1",
    name: "Partner 1",
    role: "PARTNER",
    emailEnv: "SEED_PARTNER1_EMAIL",
    passwordEnv: "SEED_PARTNER1_PASSWORD",
    defaultEmail: "partner1@qcrackers.local",
  },
  {
    code: "P2",
    name: "Partner 2",
    role: "PARTNER",
    emailEnv: "SEED_PARTNER2_EMAIL",
    passwordEnv: "SEED_PARTNER2_PASSWORD",
    defaultEmail: "partner2@qcrackers.local",
  },
  {
    code: "P3",
    name: "Partner 3",
    role: "PARTNER",
    emailEnv: "SEED_PARTNER3_EMAIL",
    passwordEnv: "SEED_PARTNER3_PASSWORD",
    defaultEmail: "partner3@qcrackers.local",
  },
  {
    code: "S1",
    name: "Staff 1",
    role: "STAFF",
    emailEnv: "SEED_STAFF1_EMAIL",
    passwordEnv: "SEED_STAFF1_PASSWORD",
    defaultEmail: "staff1@qcrackers.local",
  },
  {
    code: "S2",
    name: "Staff 2",
    role: "STAFF",
    emailEnv: "SEED_STAFF2_EMAIL",
    passwordEnv: "SEED_STAFF2_PASSWORD",
    defaultEmail: "staff2@qcrackers.local",
  },
];

async function seedRoles() {
  const partner = await prisma.role.upsert({
    where: { key: "PARTNER" },
    update: {
      name: "Partner",
      description: "Full access to the entire system.",
    },
    create: {
      key: "PARTNER",
      name: "Partner",
      description: "Full access to the entire system.",
    },
  });
  const staff = await prisma.role.upsert({
    where: { key: "STAFF" },
    update: {
      name: "Staff",
      description: "Limited access as configured per account.",
    },
    create: {
      key: "STAFF",
      name: "Staff",
      description: "Limited access as configured per account.",
    },
  });
  return { partner, staff };
}

async function seedPermissions() {
  for (const key of PERMISSION_KEYS) {
    const meta = PERMISSIONS[key];
    await prisma.permission.upsert({
      where: { key },
      update: { category: meta.category, description: meta.description },
      create: { key, category: meta.category, description: meta.description },
    });
  }
  return prisma.permission.findMany();
}

async function wireRolePermissions(
  roleId: string,
  keys: readonly string[],
  permissionIdByKey: Map<string, string>,
) {
  const desired = new Set(keys);
  const current = await prisma.rolePermission.findMany({
    where: { roleId },
    include: { permission: true },
  });
  const currentKeys = new Set(current.map((r) => r.permission.key));

  // Add missing.
  for (const key of desired) {
    if (!currentKeys.has(key)) {
      await prisma.rolePermission.create({
        data: { roleId, permissionId: permissionIdByKey.get(key)! },
      });
    }
  }
  // Remove ones no longer in the default set.
  for (const row of current) {
    if (!desired.has(row.permission.key)) {
      await prisma.rolePermission.delete({
        where: {
          roleId_permissionId: { roleId, permissionId: row.permissionId },
        },
      });
    }
  }
}

async function seedUsers(roleIdByKey: Record<"PARTNER" | "STAFF", string>) {
  const created: { code: string; email: string; password: string }[] = [];

  for (const u of SEED_USERS) {
    const existing = await prisma.user.findUnique({ where: { code: u.code } });
    if (existing) {
      console.info(`  • ${u.code} already exists — left untouched`);
      continue;
    }

    const email = (process.env[u.emailEnv] || u.defaultEmail).toLowerCase();
    const password = process.env[u.passwordEnv] || generateTemporaryPassword();
    const passwordHash = await hashPassword(password);

    await prisma.user.create({
      data: {
        code: u.code,
        name: u.name,
        email,
        passwordHash,
        roleId: roleIdByKey[u.role],
        mustChangePassword: true,
      },
    });
    created.push({ code: u.code, email, password });
  }

  return created;
}

async function main() {
  console.info("Seeding Q Crackers …");

  const { partner, staff } = await seedRoles();
  const permissions = await seedPermissions();
  const permissionIdByKey = new Map(permissions.map((p) => [p.key, p.id]));

  await wireRolePermissions(
    partner.id,
    partnerPermissions(),
    permissionIdByKey,
  );
  await wireRolePermissions(
    staff.id,
    STAFF_DEFAULT_PERMISSIONS,
    permissionIdByKey,
  );
  console.info(
    `  • permissions: ${PERMISSION_KEYS.length} • partner grants: all • staff grants: ${STAFF_DEFAULT_PERMISSIONS.length}`,
  );

  const created = await seedUsers({ PARTNER: partner.id, STAFF: staff.id });

  await prisma.auditLog.create({
    data: {
      actorRole: "SYSTEM",
      action: "system.seed",
      summary: `Seed run — ${created.length} account(s) created`,
      details: { createdCodes: created.map((c) => c.code) },
    },
  });

  if (created.length > 0) {
    console.info("\n=== TEMPORARY PASSWORDS (shown once — store securely) ===");
    for (const c of created) {
      console.info(`  ${c.code}  ${c.email}\n        ${c.password}`);
    }
    console.info(
      "\nEvery account must set a new password on first sign-in.\n" +
        "========================================================\n",
    );
  } else {
    console.info("\nNo new accounts created.\n");
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
