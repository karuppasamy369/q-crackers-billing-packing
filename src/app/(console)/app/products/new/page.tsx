import Link from "next/link";
import { requireAuth, hasPermission } from "@/server/rbac/authorize";
import { listCategories } from "@/server/services/categories-service";
import { getSetting } from "@/server/services/settings-service";
import { PageHeader, Card, Forbidden } from "@/components/console/ui";
import { ProductCreateForm } from "../product-create-form";

export default async function NewProductPage() {
  const auth = await requireAuth();
  if (!hasPermission(auth, "products.manage")) return <Forbidden />;

  const [categories, defaultGstRateBp] = await Promise.all([
    listCategories(),
    getSetting("tax.defaultGstRateBp"),
  ]);

  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader title="New product" />
      <Link
        href="/app/products"
        className="text-sm text-gray-500 underline hover:text-gray-800"
      >
        ← Back to products
      </Link>

      {categories.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-600">
            Create a category first —{" "}
            <Link href="/app/categories" className="underline">
              Categories
            </Link>
            .
          </p>
        </Card>
      ) : (
        <Card>
          <ProductCreateForm
            categories={categories.map((c) => ({ id: c.id, name: c.name }))}
            defaultGstRateBp={defaultGstRateBp}
          />
        </Card>
      )}
    </div>
  );
}
