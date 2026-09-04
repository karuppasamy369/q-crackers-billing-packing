import { vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma";
import { generateSessionToken, hashSessionToken } from "@/server/auth/tokens";
import { SESSION_COOKIE } from "@/lib/auth/cookie";

/**
 * Integration-test harness: mock `next/headers` so services that call
 * `cookies()` / `headers()` (via `requirePermission`, `getRequestContext`)
 * work outside a real request, and provide `loginAs` / `logout` helpers that
 * create genuine session rows.
 */
const h = vi.hoisted(() => ({
  cookieJar: new Map<string, string>(),
  headerRef: { current: new Headers({ "user-agent": "vitest" }) },
}));

// React's `cache()` would memoise `getCurrentAuth` / `getEffectiveSettings`
// for the life of the process outside a real request. Make it a pass-through
// so each test sees fresh state.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const identity = <A extends unknown[], R>(fn: (...args: A) => R) => fn;
  return { ...actual, cache: identity };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      h.cookieJar.has(name)
        ? { name, value: h.cookieJar.get(name)! }
        : undefined,
    set: (name: string, value: string) => {
      h.cookieJar.set(name, value);
    },
    delete: (name: string) => {
      h.cookieJar.delete(name);
    },
  }),
  headers: async () => h.headerRef.current,
}));

export const TEST_DB = process.env.TEST_DATABASE_URL;

// Reuse the app's own Prisma singleton so the tests exercise exactly the same
// client the services use. (Imported after the mocks above.)
export { db } from "@/server/db";

/** Create a session for the user with the given code and set the cookie. */
export async function loginAs(
  prisma: PrismaClient,
  code: string,
): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { code } });
  const raw = generateSessionToken();
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: hashSessionToken(raw),
      expiresAt: new Date(Date.now() + 3_600_000),
      absoluteExpiresAt: new Date(Date.now() + 3_600_000),
    },
  });
  h.cookieJar.set(SESSION_COOKIE, raw);
  return user.id;
}

export function logout(): void {
  h.cookieJar.delete(SESSION_COOKIE);
}

export async function resetCatalogue(prisma: PrismaClient): Promise<void> {
  // Order matters for FKs (bill_items/order_items/status_history cascade).
  await prisma.bill.deleteMany();
  await prisma.billSequence.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.partnerPaymentAccount.deleteMany();
  await prisma.order.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.inventoryMovement.deleteMany();
  await prisma.productImage.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.session.deleteMany();
  // audit_logs is append-only (DB trigger) and intentionally not cleared.
}
