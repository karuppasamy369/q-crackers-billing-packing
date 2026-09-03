// Author a new migration.
//
//   npm run db:migration:new -- <snake_case_name>
//
// Generates the table/column diff (schema.prisma vs. the current migration
// history) into a new timestamped folder. Add any CHECK constraints, partial
// indexes or triggers by hand at the bottom of the generated SQL — Prisma's
// schema language cannot express those, so they live only in the migration.
//
// Requires a reachable PostgreSQL for the throwaway shadow database
// (SHADOW_DATABASE_URL, else DIRECT_URL, else DATABASE_URL — e.g. the local
// docker-compose database).
//
// Apply migrations with `npm run prisma:migrate` (prisma migrate deploy).
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import "dotenv/config";

const name = process.argv[2];
if (!name || !/^[a-z][a-z0-9_]*$/.test(name)) {
  console.error("Usage: npm run db:migration:new -- <snake_case_name>");
  process.exit(1);
}

const shadow =
  process.env.SHADOW_DATABASE_URL ||
  process.env.DIRECT_URL ||
  process.env.DATABASE_URL;
if (!shadow) {
  console.error("No SHADOW_DATABASE_URL / DIRECT_URL / DATABASE_URL set.");
  process.exit(1);
}

const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
const dir = `prisma/migrations/${ts}_${name}`;
mkdirSync(dir, { recursive: true });

const sql = execFileSync(
  "npx",
  [
    "prisma",
    "migrate",
    "diff",
    "--from-migrations",
    "prisma/migrations",
    "--to-schema-datamodel",
    "prisma/schema.prisma",
    "--shadow-database-url",
    shadow,
    "--script",
  ],
  { encoding: "utf8", shell: process.platform === "win32" },
);

writeFileSync(
  `${dir}/migration.sql`,
  `${sql}\n-- Add CHECK constraints / partial indexes / triggers below this line.\n`,
);
console.log(`Created ${dir}/migration.sql`);
console.log("Review it, add any manual SQL, then run: npm run prisma:migrate");
