import Link from "next/link";
import { requireAuth, hasPermission } from "@/server/rbac/authorize";
import { listStock } from "@/server/services/inventory-service";
import { PageHeader, Card, Forbidden } from "@/components/console/ui";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; low?: string; page?: string }>;
}) {
  const auth = await requireAuth();
  if (!hasPermission(auth, "inventory.view")) return <Forbidden />;

  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const result = await listStock({
    q: sp.q,
    lowOnly: sp.low === "1",
    page,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="Stock on hand, reserved, and reorder alerts."
      />

      <Card className="p-0">
        <form className="flex flex-wrap items-center gap-2 border-b border-gray-200 p-3 text-sm">
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Search name or SKU"
            className="rounded-md border border-gray-300 px-2 py-1.5"
          />
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              name="low"
              value="1"
              defaultChecked={sp.low === "1"}
            />
            Low stock only
          </label>
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-3 py-1.5 font-semibold text-white"
          >
            Filter
          </button>
        </form>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">On hand</th>
              <th className="px-4 py-3">Reserved</th>
              <th className="px-4 py-3">Available</th>
              <th className="px-4 py-3">Reorder at</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r) => (
              <tr
                key={r.id}
                className={`border-b border-gray-100 last:border-0 ${
                  r.low ? "bg-amber-50" : ""
                }`}
              >
                <td className="px-4 py-3 font-mono text-xs">{r.sku}</td>
                <td className="px-4 py-3">{r.name}</td>
                <td className="px-4 py-3">{r.onHand}</td>
                <td className="px-4 py-3 text-gray-500">{r.reserved}</td>
                <td className="px-4 py-3 font-medium">
                  {r.available}
                  {r.low ? (
                    <span className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] text-amber-900">
                      LOW
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {r.reorderLevel || "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/app/inventory/${r.id}`}
                    className="text-gray-700 underline hover:text-gray-900"
                  >
                    {hasPermission(auth, "inventory.adjust")
                      ? "Adjust"
                      : "History"}
                  </Link>
                </td>
              </tr>
            ))}
            {result.rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  Nothing to show.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>

      {result.pageCount > 1 ? (
        <p className="text-sm text-gray-500">
          Page {result.page} of {result.pageCount} · {result.total} items
        </p>
      ) : null}
    </div>
  );
}
