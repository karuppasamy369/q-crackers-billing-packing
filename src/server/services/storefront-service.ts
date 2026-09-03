import "server-only";

import { db } from "@/server/db";
import { NotFoundError } from "@/server/http/errors";

const PAGE_SIZE = 24;

/**
 * Public storefront reads. NO authentication. Every query is constrained to
 * `isVisibleOnline = true AND isActive = true`, and results are projected to a
 * safe shape — no SKU, no stock, no internal flags, no audit data.
 */

export type PublicProductCard = {
  slug: string;
  name: string;
  pricePaise: number;
  mrpPaise: number | null;
  primaryImageId: string | null;
  categoryName: string;
  categorySlug: string;
};

export type PublicProductDetail = PublicProductCard & {
  description: string | null;
  gstRateBp: number;
  imageIds: string[];
};

function visibleProductWhere() {
  return {
    isActive: true,
    isVisibleOnline: true,
    category: { isActive: true },
  } as const;
}

export async function listPublicCategories(): Promise<
  { slug: string; name: string; productCount: number }[]
> {
  const categories = await db.category.findMany({
    where: {
      isActive: true,
      products: { some: { isActive: true, isVisibleOnline: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      slug: true,
      name: true,
      _count: {
        select: {
          products: { where: { isActive: true, isVisibleOnline: true } },
        },
      },
    },
  });
  return categories.map((c) => ({
    slug: c.slug,
    name: c.name,
    productCount: c._count.products,
  }));
}

export async function listPublicProducts(opts: {
  categorySlug?: string;
  page?: number;
}): Promise<{
  rows: PublicProductCard[];
  page: number;
  pageCount: number;
  total: number;
  category: { slug: string; name: string } | null;
}> {
  const page = Math.max(1, Math.floor(opts.page ?? 1));

  let category: { slug: string; name: string } | null = null;
  if (opts.categorySlug) {
    const found = await db.category.findFirst({
      where: { slug: opts.categorySlug, isActive: true },
      select: { slug: true, name: true },
    });
    if (!found) throw new NotFoundError("Category not found.");
    category = found;
  }

  const where = {
    ...visibleProductWhere(),
    ...(category ? { category: { slug: category.slug, isActive: true } } : {}),
  };

  const total = await db.product.count({ where });
  const rows = await db.product.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      slug: true,
      name: true,
      pricePaise: true,
      mrpPaise: true,
      category: { select: { name: true, slug: true } },
      images: {
        where: { isPrimary: true },
        take: 1,
        select: { id: true },
      },
    },
  });

  return {
    rows: rows.map((p) => ({
      slug: p.slug,
      name: p.name,
      pricePaise: p.pricePaise,
      mrpPaise: p.mrpPaise,
      primaryImageId: p.images[0]?.id ?? null,
      categoryName: p.category.name,
      categorySlug: p.category.slug,
    })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    category,
  };
}

export async function getPublicProduct(
  slug: string,
): Promise<PublicProductDetail> {
  const product = await db.product.findFirst({
    where: { slug, ...visibleProductWhere() },
    select: {
      slug: true,
      name: true,
      description: true,
      pricePaise: true,
      mrpPaise: true,
      gstRateBp: true,
      category: { select: { name: true, slug: true } },
      images: {
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
        select: { id: true },
      },
    },
  });
  if (!product) throw new NotFoundError("Product not found.");

  return {
    slug: product.slug,
    name: product.name,
    description: product.description,
    pricePaise: product.pricePaise,
    mrpPaise: product.mrpPaise,
    gstRateBp: product.gstRateBp,
    primaryImageId: product.images[0]?.id ?? null,
    imageIds: product.images.map((i) => i.id),
    categoryName: product.category.name,
    categorySlug: product.category.slug,
  };
}
