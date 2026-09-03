import "server-only";

import { db } from "@/server/db";
import { requirePermission } from "@/server/rbac/authorize";
import { recordAudit } from "@/server/services/audit";
import { getRequestContext } from "@/server/http/request-context";
import { NotFoundError, ValidationError } from "@/server/http/errors";
import { auditActor, uniqueSlug, diffFields } from "@/server/services/_helpers";
import {
  categoryCreateSchema,
  categoryUpdateSchema,
  categoryIdSchema,
} from "@/lib/validation/catalogue";

export async function listCategories() {
  await requirePermission("products.view");
  return db.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { products: true } } },
  });
}

export async function getCategory(rawId: string) {
  await requirePermission("products.view");
  const { id } = categoryIdSchema.parse({ id: rawId });
  const category = await db.category.findUnique({
    where: { id },
    include: { _count: { select: { products: true } } },
  });
  if (!category) throw new NotFoundError("That category does not exist.");
  return category;
}

export async function createCategory(raw: unknown) {
  const auth = await requirePermission("products.manage");
  const input = categoryCreateSchema.parse(raw);
  const ctx = await getRequestContext();

  const slug = await uniqueSlug("category", {
    desired: input.slug,
    fallbackName: input.name,
  });

  const category = await db.category.create({
    data: {
      name: input.name,
      slug,
      description: input.description || null,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
    },
  });

  await recordAudit(
    auditActor(auth),
    {
      action: "category.create",
      summary: `${auth.user.code} created category "${category.name}"`,
      entityType: "Category",
      entityId: category.id,
      details: { name: category.name, slug: category.slug },
    },
    ctx,
  );
  return category;
}

export async function updateCategory(raw: unknown) {
  const auth = await requirePermission("products.manage");
  const input = categoryUpdateSchema.parse(raw);
  const ctx = await getRequestContext();

  const existing = await db.category.findUnique({ where: { id: input.id } });
  if (!existing) throw new NotFoundError("That category does not exist.");

  const slug =
    input.slug !== undefined && input.slug !== existing.slug
      ? await uniqueSlug("category", {
          desired: input.slug,
          fallbackName: input.name ?? existing.name,
          excludeId: existing.id,
        })
      : existing.slug;

  const data = {
    name: input.name ?? existing.name,
    slug,
    description:
      input.description === undefined
        ? existing.description
        : input.description || null,
    sortOrder: input.sortOrder ?? existing.sortOrder,
    isActive: input.isActive ?? existing.isActive,
  };

  const updated = await db.category.update({ where: { id: input.id }, data });

  await recordAudit(
    auditActor(auth),
    {
      action: "category.update",
      summary: `${auth.user.code} updated category "${updated.name}"`,
      entityType: "Category",
      entityId: updated.id,
      details: diffFields(existing, data),
    },
    ctx,
  );
  return updated;
}

export async function deleteCategory(raw: unknown) {
  const auth = await requirePermission("products.manage");
  const { id } = categoryIdSchema.parse(raw);
  const ctx = await getRequestContext();

  const existing = await db.category.findUnique({
    where: { id },
    include: { _count: { select: { products: true } } },
  });
  if (!existing) throw new NotFoundError("That category does not exist.");
  if (existing._count.products > 0) {
    throw new ValidationError(
      "Move or delete this category's products before deleting it.",
    );
  }

  await db.category.delete({ where: { id } });

  await recordAudit(
    auditActor(auth),
    {
      action: "category.delete",
      summary: `${auth.user.code} deleted category "${existing.name}"`,
      entityType: "Category",
      entityId: id,
      details: { name: existing.name, slug: existing.slug },
    },
    ctx,
  );
}
