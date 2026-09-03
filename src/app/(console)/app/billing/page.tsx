import Link from "next/link";
import { requireAuth, hasPermission } from "@/server/rbac/authorize";
import {
  listBills,
  listBillableOrders,
} from "@/server/services/billing-service";
import { PageHeader, Card, Forbidden } from "@/components/console/ui";
import { formatPaise } from "@/lib/money";
import { IssueBillButton } from "./issue-bill-button";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    code?: string;
    type?: string;
    status?: string;
    page?: string;
  }>;
}) {
  const auth = await requireAuth();
  if (!hasPermission(auth, "billing.view")) return <Forbidden />;
  const canCreate = hasPermission(auth, "billing.create");

  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const [result, billable] = await Promise.all([
    listBills({
      q: sp.q,
      code: sp.code,
      type: sp.type,
      status: sp.status,
      page,
    }),
    listBillableOrders(),
  ]);

  const mkPage = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v) params.set(k, v);
    params.set("page", String(p));
    return `/app/billing?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing"
        description="Tax invoices. Counter sales are billed under your own code; online orders under the house partner code."
        actions={
          canCreate ? (
            <Link
              href="/app/billing/new"
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
            >
              New counter bill
            </Link>
          ) : null
        }
      />

      {billable.length > 0 ? (
        <Card>
          <h2 className="mb-3 text-sm font-semibold">
            Paid orders awaiting a bill
          </h2>
          <table className="w-full text-sm">
            <tbody>
              {billable.map((o) => (
                <tr
                  key={o.id}
                  className="border-b border-gray-100 last:border-0"
                >
                  <td className="py-2 font-mono text-xs">
                    {o.reference.slice(0, 10)}…
                  </td>
                  <td className="py-2">{o.customerName}</td>
                  <td className="py-2">{o._count.items} items</td>
                  <td className="py-2">{formatPaise(o.totalPaise)}</td>
                  <td className="py-2 text-right">
                    {canCreate ? <IssueBillButton orderId={o.id} /> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}

      <Card className="p-0">
        <form className="flex flex-wrap gap-2 border-b border-gray-200 p-3 text-sm">
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Bill no / name / phone"
            className="rounded-md border border-gray-300 px-2 py-1.5"
          />
          <input
            name="code"
            defaultValue={sp.code ?? ""}
            placeholder="Code (PK…)"
            className="w-24 rounded-md border border-gray-300 px-2 py-1.5"
          />
          <select
            name="type"
            defaultValue={sp.type ?? ""}
            className="rounded-md border border-gray-300 px-2 py-1.5"
          >
            <option value="">Any type</option>
            <option value="COUNTER">Counter</option>
            <option value="ONLINE_ORDER">Online order</option>
          </select>
          <select
            name="status"
            defaultValue={sp.status ?? ""}
            className="rounded-md border border-gray-300 px-2 py-1.5"
          >
            <option value="">Any status</option>
            <option value="ISSUED">Issued</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-3 py-1.5 font-semibold text-white"
          >
            Filter
          </button>
          <Link
            href="/app/billing"
            className="rounded-md border border-gray-300 px-3 py-1.5"
          >
            Clear
          </Link>
        </form>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">Bill no</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Buyer</th>
              <th className="px-4 py-3">By</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {result.rows.map((b) => (
              <tr key={b.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3 font-mono">{b.billNumber}</td>
                <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                  {new Date(b.billedAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-xs">
                  {b.type === "COUNTER" ? "Counter" : "Online"}
                </td>
                <td className="px-4 py-3">{b.buyerName}</td>
                <td className="px-4 py-3 font-mono text-xs">
                  {b.createdBy?.code ?? "—"}
                </td>
                <td className="px-4 py-3">{formatPaise(b.totalPaise)}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      b.status === "CANCELLED"
                        ? "rounded bg-red-100 px-2 py-0.5 text-xs text-red-800"
                        : "rounded bg-green-100 px-2 py-0.5 text-xs text-green-800"
                    }
                  >
                    {b.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/app/billing/${b.id}`}
                    className="text-gray-700 underline hover:text-gray-900"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {result.rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  No bills yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>
          {result.total} bill{result.total === 1 ? "" : "s"} · page{" "}
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
