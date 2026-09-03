import Link from "next/link";
import { formatPaise } from "@/lib/money";
import type { PublicProductCard } from "@/server/services/storefront-service";

export function ProductImage({
  imageId,
  alt,
  className = "",
}: {
  imageId: string | null;
  alt: string;
  className?: string;
}) {
  if (!imageId) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-100 text-xs text-gray-400 ${className}`}
        aria-hidden
      >
        No image
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/media/product-images/${imageId}`}
      alt={alt}
      loading="lazy"
      className={`object-cover ${className}`}
    />
  );
}

export function Price({
  pricePaise,
  mrpPaise,
}: {
  pricePaise: number;
  mrpPaise: number | null;
}) {
  const showMrp = mrpPaise != null && mrpPaise > pricePaise;
  return (
    <span className="flex items-baseline gap-2">
      <span className="font-semibold text-gray-900">
        {formatPaise(pricePaise)}
      </span>
      {showMrp ? (
        <span className="text-xs text-gray-400 line-through">
          {formatPaise(mrpPaise)}
        </span>
      ) : null}
    </span>
  );
}

export function ProductCard({ product }: { product: PublicProductCard }) {
  return (
    <Link
      href={`/products/${product.slug}`}
      className="group block overflow-hidden rounded-xl border border-gray-200 transition hover:shadow-md"
    >
      <ProductImage
        imageId={product.primaryImageId}
        alt={product.name}
        className="aspect-square w-full"
      />
      <div className="space-y-1 p-3">
        <p className="text-xs text-gray-400">{product.categoryName}</p>
        <p className="line-clamp-2 text-sm font-medium text-gray-900">
          {product.name}
        </p>
        <Price pricePaise={product.pricePaise} mrpPaise={product.mrpPaise} />
      </div>
    </Link>
  );
}
