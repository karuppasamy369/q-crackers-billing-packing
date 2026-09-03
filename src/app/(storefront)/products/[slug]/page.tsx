import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getStorefrontContext } from "@/server/storefront/context";
import { getPublicProduct } from "@/server/services/storefront-service";
import { isAppError } from "@/server/http/errors";
import { ProductImage, Price } from "@/components/storefront/product-card";
import { AddToCart } from "@/components/storefront/add-to-cart";
import { formatGstRateBp } from "@/lib/money";

export const dynamic = "force-dynamic";

async function load(slug: string) {
  try {
    return await getPublicProduct(slug);
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const product = await getPublicProduct(slug);
    return {
      title: product.name,
      description: product.description ?? undefined,
    };
  } catch {
    return { title: "Product" };
  }
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { t, settings } = await getStorefrontContext();
  const product = await load(slug);

  const gstNote = settings["tax.pricesIncludeGst"]
    ? t.product.inclusiveGst
    : t.product.plusGst;

  return (
    <article className="grid gap-8 md:grid-cols-2">
      <div className="space-y-3">
        <ProductImage
          imageId={product.primaryImageId}
          alt={product.name}
          className="aspect-square w-full rounded-xl border border-gray-200"
        />
        {product.imageIds.length > 1 ? (
          <div className="grid grid-cols-4 gap-2">
            {product.imageIds.map((id) => (
              <ProductImage
                key={id}
                imageId={id}
                alt={product.name}
                className="aspect-square w-full rounded-lg border border-gray-200"
              />
            ))}
          </div>
        ) : null}
      </div>

      <div>
        <Link
          href={`/?category=${encodeURIComponent(product.categorySlug)}`}
          className="text-xs text-gray-400 hover:underline"
        >
          {t.product.category}: {product.categoryName}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-gray-900">
          {product.name}
        </h1>

        <div className="mt-4 text-lg">
          <Price pricePaise={product.pricePaise} mrpPaise={product.mrpPaise} />
        </div>
        <p className="mt-1 text-xs text-gray-500">
          {gstNote}
          {product.gstRateBp > 0
            ? ` · GST ${formatGstRateBp(product.gstRateBp)}`
            : ""}
        </p>

        <div className="mt-6">
          <AddToCart
            slug={product.slug}
            label={t.product.addToCart}
            addedLabel={t.product.added}
          />
        </div>

        {product.description ? (
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-gray-900">
              {t.product.description}
            </h2>
            <p className="mt-2 whitespace-pre-line text-sm text-gray-600">
              {product.description}
            </p>
          </div>
        ) : null}
      </div>
    </article>
  );
}
