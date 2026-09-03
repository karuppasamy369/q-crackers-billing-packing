import "server-only";

import { PrismaClient } from "@/generated/prisma";
import { isProduction } from "@/env";

/**
 * Single shared Prisma client.
 *
 * In development Next.js hot-reload would otherwise create a new client on
 * every edit and exhaust the database connection pool, so we cache it on
 * `globalThis`.
 *
 * IMPORTANT: nothing outside `src/server/**` should import this. All database
 * access goes through the service layer so that authorization and business
 * rules are enforced in exactly one place.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProduction ? ["warn", "error"] : ["warn", "error"],
  });

if (!isProduction) globalForPrisma.prisma = db;
