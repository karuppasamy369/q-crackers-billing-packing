import Link from "next/link";
import { requireAuth, hasPermission } from "@/server/rbac/authorize";
import { listOrders, ORDER_STATUSES } from "@/server/services/orders-service";
import { PageHeader, Card, Forbidden } from "@/components/console/ui";
import { formatPaise } from "@/lib/money";

const STATUS_STYLE: Record<string, string> = {
  AWAITING_PAYMENT: "bg-amber-100 text-amber-800",
  PAYMENT_FAILED: "bg-red-100 text-red-800",
  PAID: "bg-green-100 text-green-800",
  PACKED: "bg-blue-100 text-blue-800",
  PARCEL_BOOKED: "bg-indigo-100 text-indigo-800",
  COMPLETED: "bg-gray-200 text-gray-700",
  CANCELLED: "bg-gray-200 text-gray-600",
  REFUNDED: "bg-gray-200 text-gray-600",
};

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const auth = await requireAuth();
  if (!hasPermission(auth, "orders.view")) return <Forbidden />;

  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const result = await listOrders({ q: sp.q, status: sp.status, page });

  const mkPage = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v) params.set(k, v);
    params.set("page", String(p));
    return `/app/orders?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        description="Online orders. Fulfilment actions arrive with the Booking panel in a later phase."
      />

      <Card className="p-0">
        <form className="flex flex-wrap gap-2 border-b border-gray-200 p-3 text-sm">
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Reference, name or phone"
            className="rounded-md border border-gray-300 px-2 py-1.5"
          />
          <select
            name="status"
            defaultValue={sp.status ?? "all"}
            className="rounded-md border border-gray-300 px-2 py-1.5"
          >
            <option value="all">Any status</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-3 py-1.5 font-semibold text-white"
          >
            Filter
          </button>
          <Link
            href="/app/orders"
            className="rounded-md border border-gray-300 px-3 py-1.5"
          >
            Clear
          </Link>
        </form>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">Placed</th>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {result.rows.map((o) => (
              <tr key={o.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                  {new Date(o.placedAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                  {o.reference.slice(0, 10)}…
                </td>
                <td className="px-4 py-3">
                  {o.customerName}
                  <span className="block text-xs text-gray-400">
                    {o.customerPhone}
                  </span>
                </td>
                <td className="px-4 py-3">{o._count.items}</td>
                <td className="px-4 py-3">{formatPaise(o.totalPaise)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      STATUS_STYLE[o.status] ?? "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {o.status.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/app/orders/${o.id}`}
                    className="text-gray-700 underline hover:text-gray-900"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {result.rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  No orders yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>
          {result.total} order{result.total === 1 ? "" : "s"} · page{" "}
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
