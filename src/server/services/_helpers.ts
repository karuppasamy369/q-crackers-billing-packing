import "server-only";

import { db } from "@/server/db";
import type { AuthContext } from "@/server/auth/session";
import type { AuditActor } from "@/server/services/audit";
import { slugify } from "@/lib/slug";

export function auditActor(auth: AuthContext): AuditActor {
  return {
    kind: "user",
    userId: auth.user.id,
    code: auth.user.code,
    role: auth.user.role,
  };
}

type SluggableModel = "category" | "product";

/**
 * Produce a slug that is unique within a table. Starts from `desired` (or a
 * slugified `fallbackName`), then appends -2, -3, … until free. `excludeId`
 * skips the row being updated.
 */
export async function uniqueSlug(
  model: SluggableModel,
  opts: { desired?: string; fallbackName: string; excludeId?: string },
): Promise<string> {
  const base =
    (opts.desired && opts.desired.trim()) || slugify(opts.fallbackName);
  const root = base || "item";

  for (let n = 1; n < 1000; n++) {
    const candidate = n === 1 ? root : `${root}-${n}`;
    const existing =
      model === "category"
        ? await db.category.findUnique({ where: { slug: candidate } })
        : await db.product.findUnique({ where: { slug: candidate } });
    if (!existing || existing.id === opts.excludeId) return candidate;
  }
  // Astronomically unlikely — fall back to a random suffix.
  return `${root}-${Date.now().toString(36)}`;
}

/** Shallow diff of two records, for audit `details`. */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, v] of Object.entries(after)) {
    if (v !== undefined && JSON.stringify(before[k]) !== JSON.stringify(v)) {
      out[k] = { from: before[k], to: v };
    }
  }
  return out;
}
