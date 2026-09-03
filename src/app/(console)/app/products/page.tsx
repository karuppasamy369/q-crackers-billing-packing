import Link from "next/link";
import { requireAuth, hasPermission } from "@/server/rbac/authorize";
import { listProducts } from "@/server/services/products-service";
import { listCategories } from "@/server/services/categories-service";
import { PageHeader, Card, Forbidden } from "@/components/console/ui";
import { formatPaise } from "@/lib/money";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    categoryId?: string;
    status?: string;
    page?: string;
  }>;
}) {
  const auth = await requireAuth();
  if (!hasPermission(auth, "products.view")) return <Forbidden />;
  const canManage = hasPermission(auth, "products.manage");

  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const [result, categories] = await Promise.all([
    listProducts({
      q: sp.q,
      categoryId: sp.categoryId,
      status: (sp.status as never) || "all",
      page,
    }),
    listCategories(),
  ]);

  const mkPage = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v) params.set(k, v);
    params.set("page", String(p));
    return `/app/products?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        description="Catalogue items, prices, and storefront visibility."
        actions={
          canManage ? (
            <Link
              href="/app/products/new"
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
            >
              New product
            </Link>
          ) : null
        }
      />

      <Card className="p-0">
        <form className="flex flex-wrap gap-2 border-b border-gray-200 p-3 text-sm">
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Search name or SKU"
            className="rounded-md border border-gray-300 px-2 py-1.5"
          />
          <select
            name="categoryId"
            defaultValue={sp.categoryId ?? ""}
            className="rounded-md border border-gray-300 px-2 py-1.5"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            name="status"
            defaultValue={sp.status ?? "all"}
            className="rounded-md border border-gray-300 px-2 py-1.5"
          >
            <option value="all">Any status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
          </select>
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-3 py-1.5 font-semibold text-white"
          >
            Filter
          </button>
          <Link
            href="/app/products"
            className="rounded-md border border-gray-300 px-3 py-1.5"
          >
            Clear
          </Link>
        </form>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Stock</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {result.rows.map((p) => (
              <tr key={p.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3 font-mono text-xs">{p.sku}</td>
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3 text-gray-500">{p.category.name}</td>
                <td className="px-4 py-3">{formatPaise(p.pricePaise)}</td>
                <td className="px-4 py-3">
                  {p.inventory?.quantityOnHand ?? 0}
                </td>
                <td className="px-4 py-3">
                  {p.isVisibleOnline ? (
                    <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-800">
                      Online
                    </span>
                  ) : p.isActive ? (
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                      Offline
                    </span>
                  ) : (
                    <span className="rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-600">
                      Inactive
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/app/products/${p.id}`}
                    className="text-gray-700 underline hover:text-gray-900"
                  >
                    {canManage ? "Manage" : "View"}
                  </Link>
                </td>
              </tr>
            ))}
            {result.rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  No products match.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>
          {result.total} product{result.total === 1 ? "" : "s"} · page{" "}
          {result.page} of {result.pageCount}
        </span>
        <span className="flex gap-2">
          {result.page > 1 ? (
            <Link href={mkPage(result.page - 1)} className="underline">
              ← Prev
            </Link>
          ) : null}
          {result.page < result.pageCount ? (
            <Link href={mkPage(result.page + 1)} className="underline">
              Next →
            </Link>
          ) : null}
        </span>
      </div>
    </div>
  );
}
