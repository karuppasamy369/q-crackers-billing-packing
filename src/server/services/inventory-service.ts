import "server-only";

import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma";
import { requirePermission } from "@/server/rbac/authorize";
import { recordAudit } from "@/server/services/audit";
import { getRequestContext } from "@/server/http/request-context";
import { NotFoundError, ValidationError } from "@/server/http/errors";
import { auditActor } from "@/server/services/_helpers";
import {
  inventoryAdjustSchema,
  reorderLevelSchema,
} from "@/lib/validation/catalogue";

const PAGE_SIZE = 25;

export async function listStock(
  filter: {
    q?: string;
    lowOnly?: boolean;
    page?: number;
  } = {},
) {
  await requirePermission("inventory.view");
  const page = Math.max(1, Math.floor(filter.page ?? 1));

  const where: Prisma.ProductWhereInput = {};
  if (filter.q) {
    where.OR = [
      { name: { contains: filter.q, mode: "insensitive" } },
      { sku: { contains: filter.q, mode: "insensitive" } },
    ];
  }

  const rows = await db.product.findMany({
    where,
    orderBy: [{ name: "asc" }],
    include: { inventory: true, category: { select: { name: true } } },
  });

  const mapped = rows.map((p) => {
    const onHand = p.inventory?.quantityOnHand ?? 0;
    const reserved = p.inventory?.quantityReserved ?? 0;
    const reorder = p.inventory?.reorderLevel ?? 0;
    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      categoryName: p.category.name,
      isActive: p.isActive,
      onHand,
      reserved,
      available: onHand - reserved,
      reorderLevel: reorder,
      low: reorder > 0 && onHand - reserved <= reorder,
    };
  });

  const filtered = filter.lowOnly ? mapped.filter((r) => r.low) : mapped;
  const total = filtered.length;
  const start = (page - 1) * PAGE_SIZE;

  return {
    rows: filtered.slice(start, start + PAGE_SIZE),
    total,
    page,
    pageSize: PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function getStockDetail(productId: string, page = 1) {
  await requirePermission("inventory.view");

  const product = await db.product.findUnique({
    where: { id: productId },
    include: { inventory: true },
  });
  if (!product) throw new NotFoundError("That product does not exist.");

  const p = Math.max(1, Math.floor(page));
  const total = await db.inventoryMovement.count({ where: { productId } });
  const movements = await db.inventoryMovement.findMany({
    where: { productId },
    orderBy: { createdAt: "desc" },
    skip: (p - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: { createdBy: { select: { code: true } } },
  });

  return {
    product,
    onHand: product.inventory?.quantityOnHand ?? 0,
    reserved: product.inventory?.quantityReserved ?? 0,
    reorderLevel: product.inventory?.reorderLevel ?? 0,
    movements,
    total,
    page: p,
    pageSize: PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/**
 * Adjust on-hand stock. Concurrency-safe: the inventory row is locked
 * (`SELECT … FOR UPDATE`) for the duration of the transaction, so two
 * simultaneous adjustments cannot race. Stock can never go negative (checked
 * here and by a database CHECK constraint).
 */
export async function adjustStock(raw: unknown) {
  const auth = await requirePermission("inventory.adjust");
  const input = inventoryAdjustSchema.parse(raw);
  const ctx = await getRequestContext();

  const result = await db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<
      { quantityOnHand: number; quantityReserved: number }[]
    >`SELECT "quantityOnHand", "quantityReserved"
        FROM "inventory"
        WHERE "productId" = ${input.productId}::uuid
        FOR UPDATE`;

    if (locked.length === 0) {
      throw new NotFoundError("That product has no inventory record.");
    }
    const current = locked[0]!.quantityOnHand;
    const reserved = locked[0]!.quantityReserved;

    const next =
      input.mode === "set" ? input.quantity : current + input.quantity;

    if (next < 0) {
      throw new ValidationError(
        `That change would take stock to ${next}. Stock cannot be negative.`,
      );
    }
    if (next < reserved) {
      throw new ValidationError(
        `Stock cannot go below the reserved quantity (${reserved}).`,
      );
    }
    if (next === current) {
      throw new ValidationError("That adjustment would not change anything.");
    }

    await tx.inventory.update({
      where: { productId: input.productId },
      data: { quantityOnHand: next },
    });

    const movement = await tx.inventoryMovement.create({
      data: {
        productId: input.productId,
        changeQty: next - current,
        balanceAfter: next,
        reason: input.reason,
        note: input.note || null,
        createdById: auth.user.id,
      },
    });

    await recordAudit(
      auditActor(auth),
      {
        action: "inventory.adjust",
        summary: `${auth.user.code} adjusted stock ${current} → ${next} (${input.reason})`,
        entityType: "Product",
        entityId: input.productId,
        details: {
          from: current,
          to: next,
          changeQty: next - current,
          reason: input.reason,
          note: input.note || null,
          movementId: movement.id,
        },
      },
      ctx,
      tx,
    );

    return { from: current, to: next, movementId: movement.id };
  });

  return result;
}

export async function setReorderLevel(raw: unknown) {
  const auth = await requirePermission("inventory.adjust");
  const input = reorderLevelSchema.parse(raw);
  const ctx = await getRequestContext();

  const inv = await db.inventory.findUnique({
    where: { productId: input.productId },
  });
  if (!inv) throw new NotFoundError("That product has no inventory record.");
  if (inv.reorderLevel === input.reorderLevel) return;

  await db.inventory.update({
    where: { productId: input.productId },
    data: { reorderLevel: input.reorderLevel },
  });

  await recordAudit(
    auditActor(auth),
    {
      action: "inventory.reorder_level",
      summary: `${auth.user.code} set reorder level to ${input.reorderLevel}`,
      entityType: "Product",
      entityId: input.productId,
      details: { from: inv.reorderLevel, to: input.reorderLevel },
    },
    ctx,
  );
}
