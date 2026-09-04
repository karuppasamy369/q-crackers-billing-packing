import Link from "next/link";
import { requireAuth, hasPermission } from "@/server/rbac/authorize";
import { listPayments } from "@/server/services/payments-service";
import { PageHeader, Card, Forbidden } from "@/components/console/ui";
import { formatPaise } from "@/lib/money";

const STATUS_STYLES: Record<string, string> = {
  SUBMITTED: "bg-amber-100 text-amber-800",
  VERIFIED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  FAILED: "bg-gray-200 text-gray-700",
  INITIATED: "bg-gray-100 text-gray-600",
};

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    partnerCode?: string;
    page?: string;
  }>;
}) {
  const auth = await requireAuth();
  if (!hasPermission(auth, "payments.view")) return <Forbidden />;

  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const result = await listPayments({
    q: sp.q,
    status: sp.status,
    partnerCode: sp.partnerCode,
    page,
  });

  const mkPage = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v) params.set(k, v);
    params.set("page", String(p));
    return `/app/payments?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="Customer UPI payments. Verify a submitted payment only after confirming the money reached the collecting account for the matching amount."
      />

      <Card className="p-0">
        <form className="flex flex-wrap gap-2 border-b border-gray-200 p-3 text-sm">
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="UTR / order ref / name / phone"
            className="rounded-md border border-gray-300 px-2 py-1.5"
          />
          <input
            name="partnerCode"
            defaultValue={sp.partnerCode ?? ""}
            placeholder="Partner (PK…)"
            className="w-28 rounded-md border border-gray-300 px-2 py-1.5"
          />
          <select
            name="status"
            defaultValue={sp.status ?? ""}
            className="rounded-md border border-gray-300 px-2 py-1.5"
          >
            <option value="">Any status</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="VERIFIED">Verified</option>
            <option value="REJECTED">Rejected</option>
            <option value="FAILED">Failed</option>
          </select>
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-3 py-1.5 font-semibold text-white"
          >
            Filter
          </button>
          <Link
            href="/app/payments"
            className="rounded-md border border-gray-300 px-3 py-1.5"
          >
            Clear
          </Link>
        </form>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">Submitted</th>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Partner</th>
              <th className="px-4 py-3">UTR</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {result.rows.map((p) => (
              <tr key={p.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                  {p.submittedAt
                    ? new Date(p.submittedAt).toLocaleString()
                    : new Date(p.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                  {p.order.reference.slice(0, 10)}…
                </td>
                <td className="px-4 py-3">
                  {p.order.customerName}
                  <span className="block text-xs text-gray-400">
                    {p.order.customerPhone}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                  {p.order.assignedPartnerCode ?? "—"}
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                  {p.upiReference ?? "—"}
                </td>
                <td className="px-4 py-3">
                  {formatPaise(p.amountPaise)}
                  {p.amountPaise !== p.order.totalPaise ? (
                    <span className="ml-1 text-xs text-red-600">≠ order</span>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      STATUS_STYLES[p.status] ?? "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/app/payments/${p.id}`}
                    className="text-gray-700 underline hover:text-gray-900"
                  >
                    {p.status === "SUBMITTED" &&
                    hasPermission(auth, "payments.confirm_manual")
                      ? "Review"
                      : "View"}
                  </Link>
                </td>
              </tr>
            ))}
            {result.rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  No payments yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>
          {result.total} payment{result.total === 1 ? "" : "s"} · page{" "}
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
