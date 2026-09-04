import { requireAuth, hasPermission } from "@/server/rbac/authorize";
import { getReportsBundle } from "@/server/services/reports-service";
import { isAppError } from "@/server/http/errors";
import { PageHeader, Card, StatTile, Forbidden } from "@/components/console/ui";
import { formatPaise } from "@/lib/money";

const STATUS_LABEL: Record<string, string> = {
  AWAITING_PAYMENT: "Awaiting payment",
  PAYMENT_FAILED: "Payment failed",
  PAID: "Paid",
  PACKED: "Packed",
  PARCEL_BOOKED: "Parcel booked",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
      {children}
    </th>
  );
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2">{children}</td>;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const auth = await requireAuth();
  if (!hasPermission(auth, "reports.view")) return <Forbidden />;

  const sp = await searchParams;

  let data;
  let error: string | null = null;
  try {
    data = await getReportsBundle({ from: sp.from, to: sp.to });
  } catch (err) {
    if (isAppError(err) && err.code === "VALIDATION") {
      error = err.publicMessage;
      data = await getReportsBundle({});
    } else {
      throw err;
    }
  }

  const { range } = data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Sales, GST, payments and operations for a date range. Figures cover issued bills; cancelled bills are listed separately."
      />

      <Card className="p-3">
        <form className="flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col">
            <span className="text-xs text-gray-500">From</span>
            <input
              type="date"
              name="from"
              defaultValue={range.from}
              className="mt-1 rounded-md border border-gray-300 px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col">
            <span className="text-xs text-gray-500">To</span>
            <input
              type="date"
              name="to"
              defaultValue={range.to}
              className="mt-1 rounded-md border border-gray-300 px-2 py-1.5"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-3 py-1.5 font-semibold text-white"
          >
            Update
          </button>
          {error ? <span className="text-xs text-red-700">{error}</span> : null}
        </form>
      </Card>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Bills issued" value={data.totals.bills} />
        <StatTile
          label="Total sales"
          value={formatPaise(data.totals.totalPaise)}
        />
        <StatTile
          label="Taxable value"
          value={formatPaise(data.totals.taxableValuePaise)}
        />
        <StatTile
          label="GST collected"
          value={formatPaise(
            data.totals.cgstPaise +
              data.totals.sgstPaise +
              data.totals.igstPaise,
          )}
        />
      </div>

      {/* Daily sales */}
      <Card>
        <h2 className="mb-2 text-sm font-semibold">Daily sales</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <Th>Day</Th>
                <Th>Bills</Th>
                <Th>Sales</Th>
                <Th>GST</Th>
              </tr>
            </thead>
            <tbody>
              {data.daily.days.map((d) => (
                <tr key={d.day} className="border-t border-gray-100">
                  <Td>{d.day}</Td>
                  <Td>{d.bills}</Td>
                  <Td>{formatPaise(d.totalPaise)}</Td>
                  <Td>{formatPaise(d.gstPaise)}</Td>
                </tr>
              ))}
              {data.daily.days.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-6 text-center text-gray-400"
                  >
                    No sales in this range.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Login / partner-wise billing */}
        <Card>
          <h2 className="mb-2 text-sm font-semibold">Billing by login code</h2>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Type</Th>
                <Th>Bills</Th>
                <Th>Total</Th>
              </tr>
            </thead>
            <tbody>
              {data.byCode.rows.map((r, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <Td>{r.userCode}</Td>
                  <Td>{r.type === "ONLINE_ORDER" ? "Online" : "Counter"}</Td>
                  <Td>{r.bills}</Td>
                  <Td>{formatPaise(r.totalPaise)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {/* GST summary */}
        <Card>
          <h2 className="mb-2 text-sm font-semibold">GST summary</h2>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Intra-state taxable</dt>
              <dd>{formatPaise(data.gst.intraState.taxableValuePaise)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">CGST</dt>
              <dd>{formatPaise(data.gst.intraState.cgstPaise)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">SGST</dt>
              <dd>{formatPaise(data.gst.intraState.sgstPaise)}</dd>
            </div>
            <div className="flex justify-between border-t border-gray-100 pt-1">
              <dt className="text-gray-500">Inter-state taxable</dt>
              <dd>{formatPaise(data.gst.interState.taxableValuePaise)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">IGST</dt>
              <dd>{formatPaise(data.gst.interState.igstPaise)}</dd>
            </div>
          </dl>
        </Card>

        {/* Payment summary */}
        <Card>
          <h2 className="mb-2 text-sm font-semibold">Payment summary</h2>
          <p className="text-xs text-gray-500">Online (UPI) payments</p>
          <table className="mb-3 w-full text-sm">
            <tbody>
              {data.payments.online.map((p) => (
                <tr key={p.status} className="border-t border-gray-100">
                  <Td>{p.status}</Td>
                  <Td>{p.count}</Td>
                  <Td>{formatPaise(p.amountPaise)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-gray-500">Counter bills by mode</p>
          <table className="w-full text-sm">
            <tbody>
              {data.payments.counter.map((p) => (
                <tr key={p.mode} className="border-t border-gray-100">
                  <Td>{p.mode}</Td>
                  <Td>{p.count}</Td>
                  <Td>{formatPaise(p.amountPaise)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {/* Order status summary */}
        <Card>
          <h2 className="mb-2 text-sm font-semibold">
            Orders placed by status
          </h2>
          <table className="w-full text-sm">
            <tbody>
              {data.orderStatus.rows.map((r) => (
                <tr key={r.status} className="border-t border-gray-100">
                  <Td>{STATUS_LABEL[r.status] ?? r.status}</Td>
                  <Td>{r.count}</Td>
                  <Td>{formatPaise(r.totalPaise)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {/* Packing / booking */}
        <Card>
          <h2 className="mb-2 text-sm font-semibold">Packing &amp; booking</h2>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Orders packed</dt>
              <dd>{data.booking.packed}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Parcels booked</dt>
              <dd>{data.booking.parcelBooked}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">LR documents uploaded</dt>
              <dd>{data.booking.lrUploaded}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Orders completed</dt>
              <dd>{data.booking.completed}</dd>
            </div>
            <div className="flex justify-between border-t border-gray-100 pt-1">
              <dt className="text-gray-500">Awaiting packing now</dt>
              <dd>{data.booking.awaitingPackNow}</dd>
            </div>
          </dl>
        </Card>

        {/* Cancellations */}
        <Card>
          <h2 className="mb-2 text-sm font-semibold">Cancellations</h2>
          <p className="text-sm text-gray-600">
            {data.cancellations.cancelledOrders} order
            {data.cancellations.cancelledOrders === 1 ? "" : "s"} ·{" "}
            {data.cancellations.cancelledBills} bill
            {data.cancellations.cancelledBills === 1 ? "" : "s"} cancelled
          </p>
          <ul className="mt-2 space-y-1 text-xs text-gray-500">
            {data.cancellations.bills.map((b) => (
              <li key={b.billNumber}>
                {b.billNumber} · {formatPaise(b.totalPaise)}
                {b.reason ? ` · ${b.reason}` : ""}
                {b.byCode ? ` (${b.byCode})` : ""}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Product-wise sales */}
      <Card>
        <h2 className="mb-2 text-sm font-semibold">Product-wise sales</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <Th>SKU</Th>
                <Th>Product</Th>
                <Th>Qty sold</Th>
                <Th>Revenue</Th>
              </tr>
            </thead>
            <tbody>
              {data.products.rows.map((p) => (
                <tr key={p.sku} className="border-t border-gray-100">
                  <Td>
                    <span className="font-mono text-xs">{p.sku}</span>
                  </Td>
                  <Td>{p.name}</Td>
                  <Td>{p.quantity}</Td>
                  <Td>{formatPaise(p.revenuePaise)}</Td>
                </tr>
              ))}
              {data.products.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-6 text-center text-gray-400"
                  >
                    No product sales in this range.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Stock / sales */}
      <Card>
        <h2 className="mb-2 text-sm font-semibold">
          Stock &amp; sales movement
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <Th>SKU</Th>
                <Th>Product</Th>
                <Th>Units sold</Th>
                <Th>On hand</Th>
                <Th>Reserved</Th>
              </tr>
            </thead>
            <tbody>
              {data.stock.rows.map((p) => (
                <tr key={p.sku} className="border-t border-gray-100">
                  <Td>
                    <span className="font-mono text-xs">{p.sku}</span>
                  </Td>
                  <Td>{p.name}</Td>
                  <Td>{p.unitsSold}</Td>
                  <Td>{p.onHand}</Td>
                  <Td>{p.reserved}</Td>
                </tr>
              ))}
              {data.stock.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-6 text-center text-gray-400"
                  >
                    No stock movement in this range.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
