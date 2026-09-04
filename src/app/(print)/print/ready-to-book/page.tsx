import { requireAuth, hasPermission } from "@/server/rbac/authorize";
import { getReadyToBookForReport } from "@/server/services/booking-service";
import { isAppError } from "@/server/http/errors";
import { formatPaise } from "@/lib/money";
import { PrintToolbar } from "@/components/print/print-toolbar";
import { Forbidden, Card } from "@/components/console/ui";

/**
 * "Q CRACKERS / READY TO BOOK — CONSOLIDATED REPORT" — a print-only summary of
 * every order currently ready for parcel booking, honouring the same filters
 * as the on-screen Ready to Book table.
 */
export default async function ReadyToBookReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const auth = await requireAuth();
  if (!hasPermission(auth, "booking.view")) return <Forbidden />;

  const sp = await searchParams;

  let data;
  try {
    data = await getReadyToBookForReport(sp);
  } catch (err) {
    if (isAppError(err) && err.code === "VALIDATION") {
      return (
        <Card className="border-red-200 bg-red-50">
          <p className="text-sm text-red-700">{err.publicMessage}</p>
        </Card>
      );
    }
    throw err;
  }

  const { rows, summary, filter } = data;
  const generatedAt = new Date().toLocaleString();

  const activeFilters: Array<[string, string]> = [
    filter.from ? ["From", filter.from] : null,
    filter.to ? ["To", filter.to] : null,
    filter.courier ? ["Courier / Transport", filter.courier] : null,
    filter.partnerCode ? ["Partner", filter.partnerCode] : null,
    filter.city ? ["City", filter.city] : null,
    filter.pincode ? ["Pincode", filter.pincode] : null,
    filter.q ? ["Search", filter.q] : null,
  ].filter((v): v is [string, string] => v !== null);

  return (
    <div className="print-page">
      <PrintToolbar autoPrint />

      <header className="mb-4 border-b-2 border-black pb-3">
        <p className="text-2xl font-extrabold tracking-tight">Q CRACKERS</p>
        <p className="text-lg font-bold uppercase tracking-wide">
          Ready to Book — Consolidated Report
        </p>
        <p className="mt-1 text-xs text-gray-600">Generated {generatedAt}</p>
        {activeFilters.length > 0 ? (
          <p className="mt-1 text-xs text-gray-600">
            Filters:{" "}
            {activeFilters.map(([k, v]) => `${k}: ${v}`).join(" · ")}
          </p>
        ) : (
          <p className="mt-1 text-xs text-gray-600">Filters: none (all orders)</p>
        )}
      </header>

      <div className="mb-4 grid grid-cols-4 gap-3 text-center text-sm avoid-break">
        <div className="rounded border border-black p-2">
          <div className="text-lg font-bold">{summary.orders}</div>
          <div className="text-xs text-gray-600">Orders ready</div>
        </div>
        <div className="rounded border border-black p-2">
          <div className="text-lg font-bold">{summary.parcels}</div>
          <div className="text-xs text-gray-600">Total parcels</div>
        </div>
        <div className="rounded border border-black p-2">
          <div className="text-lg font-bold">{summary.items}</div>
          <div className="text-xs text-gray-600">Total items</div>
        </div>
        <div className="rounded border border-black p-2">
          <div className="text-lg font-bold">
            {formatPaise(summary.valuePaise)}
          </div>
          <div className="text-xs text-gray-600">Total order value</div>
        </div>
      </div>
      {summary.capped ? (
        <p className="mb-2 text-xs text-red-700">
          Showing the first {rows.length} orders — narrow the filters to see an
          exact total for a larger set.
        </p>
      ) : null}

      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b-2 border-black text-left uppercase tracking-wide">
            <th className="px-1.5 py-1">S.No</th>
            <th className="px-1.5 py-1">Bill No</th>
            <th className="px-1.5 py-1">Order No</th>
            <th className="px-1.5 py-1">Customer</th>
            <th className="px-1.5 py-1">City</th>
            <th className="px-1.5 py-1">Pincode</th>
            <th className="px-1.5 py-1">Courier / Transport</th>
            <th className="px-1.5 py-1 text-right">Parcels</th>
            <th className="px-1.5 py-1 text-right">Items</th>
            <th className="px-1.5 py-1 text-right">Amount</th>
            <th className="px-1.5 py-1">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className="border-b border-gray-300">
              <td className="px-1.5 py-1">{i + 1}</td>
              <td className="px-1.5 py-1 font-mono">{r.billNumber ?? "—"}</td>
              <td className="px-1.5 py-1 font-mono">{r.orderRef}</td>
              <td className="px-1.5 py-1">{r.customerName}</td>
              <td className="px-1.5 py-1">{r.city}</td>
              <td className="px-1.5 py-1">{r.pincode}</td>
              <td className="px-1.5 py-1">{r.courierName ?? "—"}</td>
              <td className="px-1.5 py-1 text-right">
                {r.parcelCount}
                {!r.parcelCountKnown ? "*" : ""}
              </td>
              <td className="px-1.5 py-1 text-right">{r.itemCount}</td>
              <td className="px-1.5 py-1 text-right">
                {formatPaise(r.totalPaise)}
              </td>
              <td className="px-1.5 py-1">{r.status.replace(/_/g, " ")}</td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={11} className="px-1.5 py-6 text-center text-gray-400">
                No orders are ready to book for the selected filters.
              </td>
            </tr>
          ) : null}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-black font-semibold">
            <td className="px-1.5 py-1" colSpan={7}>
              Totals
            </td>
            <td className="px-1.5 py-1 text-right">{summary.parcels}</td>
            <td className="px-1.5 py-1 text-right">{summary.items}</td>
            <td className="px-1.5 py-1 text-right">
              {formatPaise(summary.valuePaise)}
            </td>
            <td className="px-1.5 py-1" />
          </tr>
        </tfoot>
      </table>
      <p className="mt-1 text-[10px] text-gray-500">
        * parcel count not yet confirmed at booking — shown as 1 until booked.
      </p>
    </div>
  );
}
