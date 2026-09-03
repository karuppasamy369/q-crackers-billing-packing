import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth, hasPermission } from "@/server/rbac/authorize";
import { getStockDetail } from "@/server/services/inventory-service";
import { isAppError } from "@/server/http/errors";
import { PageHeader, Card, Forbidden, StatTile } from "@/components/console/ui";
import { StockControls } from "../stock-controls";

export default async function StockDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const auth = await requireAuth();
  if (!hasPermission(auth, "inventory.view")) return <Forbidden />;
  const canAdjust = hasPermission(auth, "inventory.adjust");

  const { productId } = await params;
  const { page: pageStr } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageStr ?? "1", 10) || 1);

  let detail;
  try {
    detail = await getStockDetail(productId, page);
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Stock — ${detail.product.sku}`}
        description={detail.product.name}
      />
      <Link
        href="/app/inventory"
        className="text-sm text-gray-500 underline hover:text-gray-800"
      >
        ← Back to inventory
      </Link>

      <div className="grid grid-cols-3 gap-4">
        <StatTile label="On hand" value={detail.onHand} />
        <StatTile label="Reserved" value={detail.reserved} />
        <StatTile label="Available" value={detail.onHand - detail.reserved} />
      </div>

      {canAdjust ? (
        <Card>
          <h2 className="mb-3 text-sm font-semibold">Adjust stock</h2>
          <StockControls
            productId={detail.product.id}
            reorderLevel={detail.reorderLevel}
          />
        </Card>
      ) : null}

      <Card className="p-0">
        <h2 className="border-b border-gray-100 px-4 py-3 text-sm font-semibold">
          Movement history
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Change</th>
              <th className="px-4 py-3">Balance</th>
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3">By</th>
              <th className="px-4 py-3">Note</th>
            </tr>
          </thead>
          <tbody>
            {detail.movements.map((m) => (
              <tr key={m.id} className="border-t border-gray-100">
                <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                  {new Date(m.createdAt).toLocaleString()}
                </td>
                <td
                  className={`px-4 py-3 font-medium ${
                    m.changeQty >= 0 ? "text-green-700" : "text-red-700"
                  }`}
                >
                  {m.changeQty >= 0 ? "+" : ""}
                  {m.changeQty}
                </td>
                <td className="px-4 py-3">{m.balanceAfter}</td>
                <td className="px-4 py-3 text-xs">{m.reason}</td>
                <td className="px-4 py-3 text-gray-500">
                  {m.createdBy?.code ?? "system"}
                </td>
                <td className="px-4 py-3 text-gray-500">{m.note ?? "—"}</td>
              </tr>
            ))}
            {detail.movements.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  No movements recorded.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>

      {detail.pageCount > 1 ? (
        <div className="flex gap-3 text-sm">
          {detail.page > 1 ? (
            <Link
              href={`/app/inventory/${productId}?page=${detail.page - 1}`}
              className="underline"
            >
              ← Newer
            </Link>
          ) : null}
          {detail.page < detail.pageCount ? (
            <Link
              href={`/app/inventory/${productId}?page=${detail.page + 1}`}
              className="underline"
            >
              Older →
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
