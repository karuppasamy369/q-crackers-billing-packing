import "server-only";

import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma";
import { requirePermission } from "@/server/rbac/authorize";
import { recordAudit } from "@/server/services/audit";
import { getRequestContext } from "@/server/http/request-context";
import { NotFoundError, ValidationError } from "@/server/http/errors";
import { auditActor, uniqueSlug, diffFields } from "@/server/services/_helpers";
import { getStorage, MEDIA_PREFIX } from "@/server/integrations/storage";
import { validateImageUpload } from "@/lib/image-validation";
import { env } from "@/env";
import {
  productCreateSchema,
  productUpdateSchema,
  productPriceSchema,
  productVisibilitySchema,
  productIdSchema,
  productImageMetaSchema,
  imageIdSchema,
} from "@/lib/validation/catalogue";
import { getSetting } from "@/server/services/settings-service";

const PAGE_SIZE = 25;
const MAX_IMAGES_PER_PRODUCT = 8;

export type ProductListFilter = {
  q?: string;
  categoryId?: string;
  status?: "all" | "active" | "inactive" | "online" | "offline";
  page?: number;
};

export async function listProducts(filter: ProductListFilter = {}) {
  await requirePermission("products.view");
  const page = Math.max(1, Math.floor(filter.page ?? 1));

  const where: Prisma.ProductWhereInput = {};
  if (filter.q) {
    where.OR = [
      { name: { contains: filter.q, mode: "insensitive" } },
      { sku: { contains: filter.q, mode: "insensitive" } },
    ];
  }
  if (filter.categoryId) where.categoryId = filter.categoryId;
  switch (filter.status) {
    case "active":
      where.isActive = true;
      break;
    case "inactive":
      where.isActive = false;
      break;
    case "online":
      where.isVisibleOnline = true;
      break;
    case "offline":
      where.isVisibleOnline = false;
      break;
  }

  const total = await db.product.count({ where });
  const rows = await db.product.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: {
      category: { select: { id: true, name: true } },
      inventory: true,
      images: {
        where: { isPrimary: true },
        take: 1,
        select: { id: true },
      },
      _count: { select: { images: true } },
    },
  });

  return {
    rows,
    total,
    page,
    pageSize: PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function getProduct(rawId: string) {
  await requirePermission("products.view");
  const { id } = productIdSchema.parse({ id: rawId });
  const product = await db.product.findUnique({
    where: { id },
    include: {
      category: true,
      inventory: true,
      images: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      _count: { select: { movements: true } },
    },
  });
  if (!product) throw new NotFoundError("That product does not exist.");
  return product;
}

export async function createProduct(raw: unknown) {
  const auth = await requirePermission("products.manage");
  const input = productCreateSchema.parse(raw);
  const ctx = await getRequestContext();

  const category = await db.category.findUnique({
    where: { id: input.categoryId },
  });
  if (!category) throw new ValidationError("Choose a valid category.");

  if (input.mrpRupees !== undefined && input.mrpRupees < input.priceRupees) {
    throw new ValidationError("MRP cannot be lower than the selling price.");
  }

  const skuTaken = await db.product.findUnique({ where: { sku: input.sku } });
  if (skuTaken)
    throw new ValidationError(`SKU "${input.sku}" is already in use.`);

  const slug = await uniqueSlug("product", {
    desired: input.slug,
    fallbackName: input.name,
  });
  const gstRateBp =
    input.gstRateBp ?? (await getSetting("tax.defaultGstRateBp"));

  const product = await db.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        sku: input.sku,
        name: input.name,
        slug,
        categoryId: input.categoryId,
        description: input.description || null,
        pricePaise: input.priceRupees,
        mrpPaise: input.mrpRupees ?? null,
        hsnCode: input.hsnCode || null,
        gstRateBp,
        weightGrams: input.weightGrams ?? null,
        isActive: input.isActive,
        // A brand-new product cannot be online until it is reviewed.
        isVisibleOnline: input.isActive ? input.isVisibleOnline : false,
        sortOrder: input.sortOrder,
      },
    });
    await tx.inventory.create({ data: { productId: created.id } });
    return created;
  });

  await recordAudit(
    auditActor(auth),
    {
      action: "product.create",
      summary: `${auth.user.code} created product ${product.sku} — ${product.name}`,
      entityType: "Product",
      entityId: product.id,
      details: {
        sku: product.sku,
        pricePaise: product.pricePaise,
        categoryId: product.categoryId,
      },
    },
    ctx,
  );
  return product;
}

export async function updateProduct(raw: unknown) {
  const auth = await requirePermission("products.manage");
  const input = productUpdateSchema.parse(raw);
  const ctx = await getRequestContext();

  const existing = await db.product.findUnique({ where: { id: input.id } });
  if (!existing) throw new NotFoundError("That product does not exist.");

  if (input.sku && input.sku !== existing.sku) {
    const taken = await db.product.findUnique({ where: { sku: input.sku } });
    if (taken)
      throw new ValidationError(`SKU "${input.sku}" is already in use.`);
  }
  if (input.categoryId && input.categoryId !== existing.categoryId) {
    const cat = await db.category.findUnique({
      where: { id: input.categoryId },
    });
    if (!cat) throw new ValidationError("Choose a valid category.");
  }

  const slug =
    input.slug !== undefined && input.slug !== existing.slug
      ? await uniqueSlug("product", {
          desired: input.slug,
          fallbackName: input.name ?? existing.name,
          excludeId: existing.id,
        })
      : existing.slug;

  const data = {
    sku: input.sku ?? existing.sku,
    name: input.name ?? existing.name,
    slug,
    categoryId: input.categoryId ?? existing.categoryId,
    description:
      input.description === undefined
        ? existing.description
        : input.description || null,
    hsnCode:
      input.hsnCode === undefined ? existing.hsnCode : input.hsnCode || null,
    gstRateBp: input.gstRateBp ?? existing.gstRateBp,
    weightGrams:
      input.weightGrams === undefined
        ? existing.weightGrams
        : input.weightGrams,
    sortOrder: input.sortOrder ?? existing.sortOrder,
  };

  const updated = await db.product.update({ where: { id: input.id }, data });

  await recordAudit(
    auditActor(auth),
    {
      action: "product.update",
      summary: `${auth.user.code} updated product ${updated.sku}`,
      entityType: "Product",
      entityId: updated.id,
      details: diffFields(existing, data),
    },
    ctx,
  );
  return updated;
}

export async function updateProductPrice(raw: unknown) {
  const auth = await requirePermission("prices.manage");
  const input = productPriceSchema.parse(raw);
  const ctx = await getRequestContext();

  const existing = await db.product.findUnique({ where: { id: input.id } });
  if (!existing) throw new NotFoundError("That product does not exist.");

  const updated = await db.product.update({
    where: { id: input.id },
    data: {
      pricePaise: input.priceRupees,
      mrpPaise: input.mrpRupees ?? null,
    },
  });

  await recordAudit(
    auditActor(auth),
    {
      action: "product.price_update",
      summary: `${auth.user.code} changed the price of ${existing.sku}`,
      entityType: "Product",
      entityId: existing.id,
      details: {
        pricePaise: { from: existing.pricePaise, to: updated.pricePaise },
        mrpPaise: { from: existing.mrpPaise, to: updated.mrpPaise },
      },
    },
    ctx,
  );
  return updated;
}

export async function setProductVisibility(raw: unknown) {
  const auth = await requirePermission("products.manage");
  const input = productVisibilitySchema.parse(raw);
  const ctx = await getRequestContext();

  const existing = await db.product.findUnique({
    where: { id: input.id },
    include: { _count: { select: { images: true } } },
  });
  if (!existing) throw new NotFoundError("That product does not exist.");

  const isActive = input.isActive;
  const isVisibleOnline = isActive ? input.isVisibleOnline : false;

  if (isVisibleOnline && existing._count.images === 0) {
    throw new ValidationError(
      "Add at least one product image before publishing it to the storefront.",
    );
  }

  const updated = await db.product.update({
    where: { id: input.id },
    data: { isActive, isVisibleOnline },
  });

  await recordAudit(
    auditActor(auth),
    {
      action: "product.visibility",
      summary: `${auth.user.code} set ${existing.sku} → ${
        isVisibleOnline ? "online" : isActive ? "active, offline" : "inactive"
      }`,
      entityType: "Product",
      entityId: existing.id,
      details: {
        isActive: { from: existing.isActive, to: isActive },
        isVisibleOnline: {
          from: existing.isVisibleOnline,
          to: isVisibleOnline,
        },
      },
    },
    ctx,
  );
  return updated;
}

export async function deleteProduct(raw: unknown) {
  const auth = await requirePermission("products.manage");
  const { id } = productIdSchema.parse(raw);
  const ctx = await getRequestContext();

  const existing = await db.product.findUnique({
    where: { id },
    include: {
      inventory: true,
      images: true,
      _count: { select: { movements: true } },
    },
  });
  if (!existing) throw new NotFoundError("That product does not exist.");

  if (
    existing._count.movements > 0 ||
    (existing.inventory?.quantityOnHand ?? 0) > 0
  ) {
    throw new ValidationError(
      "This product has stock history. Mark it inactive instead of deleting it.",
    );
  }

  const storage = getStorage();
  await db.product.delete({ where: { id } });
  // Best-effort blob cleanup (DB rows are already gone via cascade).
  for (const img of existing.images) {
    await storage.delete(img.storageKey).catch(() => undefined);
  }

  await recordAudit(
    auditActor(auth),
    {
      action: "product.delete",
      summary: `${auth.user.code} deleted product ${existing.sku} — ${existing.name}`,
      entityType: "Product",
      entityId: id,
      details: { sku: existing.sku },
    },
    ctx,
  );
}

// --- Images -----------------------------------------------------------

export async function addProductImage(
  rawMeta: unknown,
  bytes: Uint8Array,
): Promise<void> {
  const auth = await requirePermission("products.manage");
  const meta = productImageMetaSchema.parse(rawMeta);
  const ctx = await getRequestContext();

  const product = await db.product.findUnique({
    where: { id: meta.productId },
    include: { _count: { select: { images: true } } },
  });
  if (!product) throw new NotFoundError("That product does not exist.");
  if (product._count.images >= MAX_IMAGES_PER_PRODUCT) {
    throw new ValidationError(
      `A product can have at most ${MAX_IMAGES_PER_PRODUCT} images.`,
    );
  }

  const check = validateImageUpload(bytes, env.STORAGE_MAX_IMAGE_BYTES);
  if (!check.ok) throw new ValidationError(check.error);

  const key = `${MEDIA_PREFIX.productImage}/${randomUUID()}.${check.extension}`;
  await getStorage().put(key, bytes, check.contentType);

  try {
    await db.productImage.create({
      data: {
        productId: product.id,
        storageKey: key,
        altText: meta.altText || null,
        contentType: check.contentType,
        sizeBytes: bytes.length,
        sortOrder: product._count.images,
        isPrimary: product._count.images === 0,
      },
    });
  } catch (e) {
    await getStorage()
      .delete(key)
      .catch(() => undefined);
    throw e;
  }

  await recordAudit(
    auditActor(auth),
    {
      action: "product.image_add",
      summary: `${auth.user.code} added an image to ${product.sku}`,
      entityType: "Product",
      entityId: product.id,
      details: { contentType: check.contentType, sizeBytes: bytes.length },
    },
    ctx,
  );
}

export async function removeProductImage(raw: unknown): Promise<void> {
  const auth = await requirePermission("products.manage");
  const { productId, imageId } = imageIdSchema.parse(raw);
  const ctx = await getRequestContext();

  const image = await db.productImage.findUnique({ where: { id: imageId } });
  if (!image || image.productId !== productId) {
    throw new NotFoundError("That image does not exist.");
  }

  await db.$transaction(async (tx) => {
    await tx.productImage.delete({ where: { id: imageId } });
    if (image.isPrimary) {
      const next = await tx.productImage.findFirst({
        where: { productId },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });
      if (next) {
        await tx.productImage.update({
          where: { id: next.id },
          data: { isPrimary: true },
        });
      } else {
        // No images left — a published product must have one.
        await tx.product.updateMany({
          where: { id: productId, isVisibleOnline: true },
          data: { isVisibleOnline: false },
        });
      }
    }
  });

  await getStorage()
    .delete(image.storageKey)
    .catch(() => undefined);

  await recordAudit(
    auditActor(auth),
    {
      action: "product.image_remove",
      summary: `${auth.user.code} removed an image from a product`,
      entityType: "Product",
      entityId: productId,
    },
    ctx,
  );
}

export async function setPrimaryImage(raw: unknown): Promise<void> {
  const auth = await requirePermission("products.manage");
  const { productId, imageId } = imageIdSchema.parse(raw);
  const ctx = await getRequestContext();

  const image = await db.productImage.findUnique({ where: { id: imageId } });
  if (!image || image.productId !== productId) {
    throw new NotFoundError("That image does not exist.");
  }
  if (image.isPrimary) return;

  await db.$transaction(async (tx) => {
    await tx.productImage.updateMany({
      where: { productId, isPrimary: true },
      data: { isPrimary: false },
    });
    await tx.productImage.update({
      where: { id: imageId },
      data: { isPrimary: true },
    });
  });

  await recordAudit(
    auditActor(auth),
    {
      action: "product.image_primary",
      summary: `${auth.user.code} set a new primary image`,
      entityType: "Product",
      entityId: productId,
    },
    ctx,
  );
}

/**
 * Fetch the bytes for a product image, applying the visibility rule:
 * - published product (online + active): anyone may view it
 * - otherwise: the caller must hold `products.view`
 *
 * `authView` is true when the request is from an authenticated user with the
 * products.view permission (checked by the route handler).
 */
export async function loadProductImageBytes(
  imageId: string,
  authView: boolean,
): Promise<
  | { data: Uint8Array; contentType: string; public: boolean }
  | "not_found"
  | "forbidden"
> {
  const image = await db.productImage.findUnique({
    where: { id: imageId },
    include: { product: { select: { isActive: true, isVisibleOnline: true } } },
  });
  if (!image) return "not_found";

  const publiclyVisible =
    image.product.isActive && image.product.isVisibleOnline;
  if (!publiclyVisible && !authView) return "forbidden";

  const obj = await getStorage().get(image.storageKey);
  if (!obj) return "not_found";
  return {
    data: obj.data,
    contentType: obj.contentType || image.contentType,
    public: publiclyVisible,
  };
}
