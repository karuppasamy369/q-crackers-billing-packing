import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth, hasPermission } from "@/server/rbac/authorize";
import { getCategory } from "@/server/services/categories-service";
import { isAppError } from "@/server/http/errors";
import { PageHeader, Card, Forbidden } from "@/components/console/ui";
import { CategoryForm } from "../category-form";

export default async function EditCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const auth = await requireAuth();
  if (!hasPermission(auth, "products.manage")) return <Forbidden />;

  const { id } = await params;
  let category;
  try {
    category = await getCategory(id);
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  return (
    <div className="max-w-lg space-y-4">
      <PageHeader title={`Edit category — ${category.name}`} />
      <Link
        href="/app/categories"
        className="text-sm text-gray-500 underline hover:text-gray-800"
      >
        ← Back to categories
      </Link>
      <Card>
        <CategoryForm
          category={{
            id: category.id,
            name: category.name,
            slug: category.slug,
            description: category.description,
            sortOrder: category.sortOrder,
            isActive: category.isActive,
          }}
        />
      </Card>
    </div>
  );
}
