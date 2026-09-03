import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth, hasPermission } from "@/server/rbac/authorize";
import { getProduct } from "@/server/services/products-service";
import { listCategories } from "@/server/services/categories-service";
import { isAppError } from "@/server/http/errors";
import { PageHeader, Card, Forbidden } from "@/components/console/ui";
import { formatPaise } from "@/lib/money";
import { ProductDetailEditor } from "../product-detail-editor";
import { ProductImages } from "../product-images";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const auth = await requireAuth();
  if (!hasPermission(auth, "products.view")) return <Forbidden />;
  const canManage = hasPermission(auth, "products.manage");
  const canPrice = hasPermission(auth, "prices.manage");

  const { id } = await params;
  let product;
  try {
    product = await getProduct(id);
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const categories = await listCategories();
  const onHand = product.inventory?.quantityOnHand ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${product.sku} — ${product.name}`}
        description={`${formatPaise(product.pricePaise)} · ${product.category.name}`}
      />
      <Link
        href="/app/products"
        className="text-sm text-gray-500 underline hover:text-gray-800"
      >
        ← Back to products
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <ProductDetailEditor
          product={{
            id: product.id,
            sku: product.sku,
            name: product.name,
            slug: product.slug,
            categoryId: product.categoryId,
            description: product.description,
            pricePaise: product.pricePaise,
            mrpPaise: product.mrpPaise,
            hsnCode: product.hsnCode,
            gstRateBp: product.gstRateBp,
            weightGrams: product.weightGrams,
            sortOrder: product.sortOrder,
            isActive: product.isActive,
            isVisibleOnline: product.isVisibleOnline,
            imageCount: product.images.length,
          }}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          canManage={canManage}
          canPrice={canPrice}
        />

        <div className="space-y-6">
          <Card>
            <h2 className="mb-2 text-sm font-semibold">Images</h2>
            <ProductImages
              productId={product.id}
              canManage={canManage}
              images={product.images.map((i) => ({
                id: i.id,
                isPrimary: i.isPrimary,
                altText: i.altText,
                contentType: i.contentType,
              }))}
            />
          </Card>

          <Card>
            <h2 className="text-sm font-semibold">Stock</h2>
            <p className="mt-1 text-2xl font-semibold">{onHand}</p>
            <p className="text-xs text-gray-500">on hand</p>
            {hasPermission(auth, "inventory.view") ? (
              <Link
                href={`/app/inventory/${product.id}`}
                className="mt-2 inline-block text-sm underline"
              >
                Stock history & adjustments →
              </Link>
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  );
}
