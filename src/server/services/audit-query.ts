import "server-only";

import { z } from "zod";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma";
import { requireAnyPermission } from "@/server/rbac/authorize";

const dateOnly = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

export const auditQuerySchema = z.object({
  action: z.string().trim().max(100).optional(),
  actorCode: z.string().trim().max(20).optional(),
  entityType: z.string().trim().max(50).optional(),
  entityId: z.string().trim().max(100).optional(),
  /** Free text over the summary and entity id (e.g. an order / bill id). */
  q: z.string().trim().max(120).optional(),
  dateFrom: dateOnly,
  dateTo: dateOnly,
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;

const PAGE_SIZE = 50;

export async function listAuditLogs(raw: unknown) {
  const auth = await requireAnyPermission(["audit.view_all", "audit.view_own"]);
  const query = auditQuerySchema.parse(raw ?? {});

  const where: Prisma.AuditLogWhereInput = {};

  // Staff with only `audit.view_own` are hard-scoped to their own actions,
  // regardless of any filter they submit.
  if (!auth.permissions.has("audit.view_all")) {
    where.actorUserId = auth.user.id;
  } else if (query.actorCode) {
    where.actorCode = query.actorCode;
  }

  if (query.action) where.action = { contains: query.action };
  if (query.entityType) where.entityType = query.entityType;
  if (query.entityId) where.entityId = query.entityId;
  if (query.q) {
    where.OR = [
      { summary: { contains: query.q, mode: "insensitive" } },
      { entityId: { contains: query.q } },
    ];
  }
  if (query.dateFrom || query.dateTo) {
    where.createdAt = {};
    if (query.dateFrom) {
      where.createdAt.gte = new Date(`${query.dateFrom}T00:00:00.000Z`);
    }
    if (query.dateTo) {
      where.createdAt.lt = new Date(
        Date.parse(`${query.dateTo}T00:00:00.000Z`) + 86_400_000,
      );
    }
  }

  const [total, rows] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: { seq: "desc" },
      skip: (query.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  return {
    rows: rows.map((r) => ({
      ...r,
      // BigInt is not JSON-serialisable across the RSC boundary.
      seq: r.seq.toString(),
    })),
    total,
    page: query.page,
    pageSize: PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    scopedToSelf: !auth.permissions.has("audit.view_all"),
  };
}
