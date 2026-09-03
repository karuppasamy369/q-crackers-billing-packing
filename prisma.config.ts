import path from "node:path";
import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma CLI configuration.
 *
 * With this file present Prisma no longer auto-loads `.env`, so we import
 * `dotenv/config` above to keep `prisma migrate` / `prisma db seed` working
 * from the shell.
 */
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "tsx prisma/seed.ts",
  },
});
