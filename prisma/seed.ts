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
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
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
import { SETTINGS, SETTING_KEYS } from "../src/lib/settings/registry";

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

async function seedSettings() {
  let created = 0;
  for (const key of SETTING_KEYS) {
    const existing = await prisma.setting.findUnique({ where: { key } });
    if (!existing) {
      await prisma.setting.create({
        data: { key, value: SETTINGS[key].default as never },
      });
      created++;
    }
  }
  return created;
}

// A valid 1x1 PNG — lets sample products be published to the storefront.
const SAMPLE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

async function writeSampleImage(): Promise<string | null> {
  if ((process.env.STORAGE_DRIVER ?? "filesystem") !== "filesystem")
    return null;
  const root = path.resolve(
    process.cwd(),
    process.env.STORAGE_FS_DIR || ".storage",
  );
  const key = `product-images/${randomUUID()}.png`;
  const file = path.join(root, key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, SAMPLE_PNG);
  await fs.writeFile(file + ".contenttype", "image/png", "utf8");
  return key;
}

async function seedSampleCatalogue() {
  if (process.env.SEED_SAMPLE_CATALOGUE !== "1") return;
  if ((await prisma.product.count()) > 0) {
    console.info("  • sample catalogue skipped (products already exist)");
    return;
  }

  const sound = await prisma.category.create({
    data: { name: "Sound Crackers", slug: "sound-crackers", sortOrder: 1 },
  });
  const sparklers = await prisma.category.create({
    data: { name: "Sparklers", slug: "sparklers", sortOrder: 2 },
  });

  const items = [
    {
      sku: "SND-1000",
      name: "1000 Wala",
      cat: sound.id,
      price: 45000,
      mrp: 60000,
      qty: 120,
    },
    {
      sku: "SND-BABY",
      name: "Baby Bijili (Box of 50)",
      cat: sound.id,
      price: 9000,
      mrp: 12000,
      qty: 300,
    },
    {
      sku: "SPK-15",
      name: "15 cm Sparklers (Pkt of 10)",
      cat: sparklers.id,
      price: 3500,
      mrp: 5000,
      qty: 500,
    },
    {
      sku: "SPK-30",
      name: "30 cm Colour Sparklers (Pkt of 10)",
      cat: sparklers.id,
      price: 6000,
      mrp: 8000,
      qty: 0,
    },
  ];

  for (const it of items) {
    const imageKey = await writeSampleImage();
    const product = await prisma.product.create({
      data: {
        sku: it.sku,
        name: it.name,
        slug: it.sku.toLowerCase(),
        categoryId: it.cat,
        description: `${it.name} — demo product created by the seed.`,
        pricePaise: it.price,
        mrpPaise: it.mrp,
        gstRateBp: 1800,
        isActive: true,
        isVisibleOnline: Boolean(imageKey) && it.qty > 0,
        inventory: { create: { quantityOnHand: it.qty, reorderLevel: 20 } },
      },
    });
    if (imageKey) {
      await prisma.productImage.create({
        data: {
          productId: product.id,
          storageKey: imageKey,
          contentType: "image/png",
          sizeBytes: SAMPLE_PNG.length,
          isPrimary: true,
        },
      });
    }
    if (it.qty > 0) {
      await prisma.inventoryMovement.create({
        data: {
          productId: product.id,
          changeQty: it.qty,
          balanceAfter: it.qty,
          reason: "RESTOCK",
          note: "Initial demo stock",
        },
      });
    }
  }
  console.info(`  • sample catalogue: 2 categories, ${items.length} products`);
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

  const settingsCreated = await seedSettings();
  console.info(`  • settings: ${settingsCreated} default row(s) created`);

  await seedSampleCatalogue();

  await prisma.auditLog.create({
    data: {
      actorRole: "SYSTEM",
      action: "system.seed",
      summary: `Seed run — ${created.length} account(s) created`,
      details: {
        createdCodes: created.map((c) => c.code),
        settingsCreated,
      },
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
