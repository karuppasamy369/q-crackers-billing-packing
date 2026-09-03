import "server-only";

import { db } from "@/server/db";
import type { Prisma, PrismaClient } from "@/generated/prisma";
import { logger } from "@/lib/logger";
import { redact } from "@/lib/redact";

export type AuditActor =
  | { kind: "user"; userId: string; code: string; role: string }
  | { kind: "system" };

export type RequestContext = {
  ip?: string | null;
  userAgent?: string | null;
};

export type AuditInput = {
  action: string;
  summary: string;
  entityType?: string;
  entityId?: string;
  details?: Prisma.InputJsonValue;
};

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Append an entry to the audit log.
 *
 * Pass `client` to make the audit write part of a surrounding transaction so
 * the action and its audit record commit or roll back together. Audit failures
 * are logged but never thrown from here — losing an audit row must not abort a
 * completed business action (the reverse is enforced by using a transaction).
 */
export async function recordAudit(
  actor: AuditActor,
  input: AuditInput,
  ctx: RequestContext = {},
  client: DbClient = db,
): Promise<void> {
  try {
    await client.auditLog.create({
      data: {
        actorUserId: actor.kind === "user" ? actor.userId : null,
        actorCode: actor.kind === "user" ? actor.code : null,
        actorRole: actor.kind === "user" ? actor.role : "SYSTEM",
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        summary: input.summary,
        details:
          input.details === undefined
            ? undefined
            : (redact(input.details) as Prisma.InputJsonValue),
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      },
    });
  } catch (err) {
    logger.error("audit.write_failed", {
      action: input.action,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
