import Link from "next/link";
import { notFound } from "next/navigation";

import { getStorefrontContext } from "@/server/storefront/context";
import { listPublicProducts } from "@/server/services/storefront-service";
import { isAppError } from "@/server/http/errors";
import { ProductCard } from "@/components/storefront/product-card";

export const dynamic = "force-dynamic";

export default async function StorefrontHome({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; page?: string }>;
}) {
  const { t } = await getStorefrontContext();
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  let result;
  try {
    result = await listPublicProducts({ categorySlug: sp.category, page });
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const mkPage = (p: number) => {
    const params = new URLSearchParams();
    if (sp.category) params.set("category", sp.category);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/?${qs}` : "/";
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">
          {result.category ? result.category.name : t.listing.heading}
        </h1>
        {result.category ? (
          <Link
            href="/"
            className="mt-1 inline-block text-sm text-gray-500 hover:underline"
          >
            {t.listing.backToAll}
          </Link>
        ) : null}
      </div>

      {result.rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          {t.listing.empty}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {result.rows.map((p) => (
            <ProductCard key={p.slug} product={p} />
          ))}
        </div>
      )}

      {result.pageCount > 1 ? (
        <div className="mt-8 flex items-center justify-center gap-4 text-sm">
          {result.page > 1 ? (
            <Link href={mkPage(result.page - 1)} className="underline">
              ←
            </Link>
          ) : null}
          <span className="text-gray-500">
            {t.listing.page} {result.page} / {result.pageCount}
          </span>
          {result.page < result.pageCount ? (
            <Link href={mkPage(result.page + 1)} className="underline">
              →
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
