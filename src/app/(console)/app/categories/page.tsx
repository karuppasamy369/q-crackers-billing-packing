import Link from "next/link";
import { requireAuth, hasPermission } from "@/server/rbac/authorize";
import { listCategories } from "@/server/services/categories-service";
import { PageHeader, Card, Forbidden } from "@/components/console/ui";
import { CategoryForm } from "./category-form";

export default async function CategoriesPage() {
  const auth = await requireAuth();
  if (!hasPermission(auth, "products.view")) return <Forbidden />;
  const canManage = hasPermission(auth, "products.manage");

  const categories = await listCategories();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categories"
        description="Group products for the storefront and internal navigation."
      />

      {canManage ? (
        <Card>
          <h2 className="mb-4 text-sm font-semibold">New category</h2>
          <CategoryForm />
        </Card>
      ) : null}

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">Products</th>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-500">
                  {c.slug}
                </td>
                <td className="px-4 py-3">{c._count.products}</td>
                <td className="px-4 py-3">{c.sortOrder}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      c.isActive
                        ? "rounded bg-green-100 px-2 py-0.5 text-xs text-green-800"
                        : "rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-700"
                    }
                  >
                    {c.isActive ? "Active" : "Hidden"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {canManage ? (
                    <Link
                      href={`/app/categories/${c.id}`}
                      className="text-gray-700 underline hover:text-gray-900"
                    >
                      Edit
                    </Link>
                  ) : null}
                </td>
              </tr>
            ))}
            {categories.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  No categories yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
