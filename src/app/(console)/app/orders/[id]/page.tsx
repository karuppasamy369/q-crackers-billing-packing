import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth, hasPermission } from "@/server/rbac/authorize";
import { getOrderForConsole } from "@/server/services/orders-service";
import { isAppError } from "@/server/http/errors";
import { PageHeader, Card, Forbidden } from "@/components/console/ui";
import { formatPaise, formatGstRateBp } from "@/lib/money";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const auth = await requireAuth();
  if (!hasPermission(auth, "orders.view")) return <Forbidden />;

  const { id } = await params;
  let order;
  try {
    order = await getOrderForConsole(id);
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Order ${order.reference.slice(0, 12)}…`}
        description={`Placed ${new Date(order.placedAt).toLocaleString()} · ${order.status.replace(/_/g, " ")} · payment ${order.paymentStatus.toLowerCase()}`}
      />
      <Link
        href="/app/orders"
        className="text-sm text-gray-500 underline hover:text-gray-800"
      >
        ← Back to orders
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3">GST</th>
                <th className="px-4 py-3">Qty</th>
                <th className="px-4 py-3">Line total</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((i) => (
                <tr
                  key={i.id}
                  className="border-b border-gray-100 last:border-0"
                >
                  <td className="px-4 py-3">
                    {i.productName}
                    <span className="block font-mono text-xs text-gray-400">
                      {i.sku}
                    </span>
                  </td>
                  <td className="px-4 py-3">{formatPaise(i.unitPricePaise)}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {formatGstRateBp(i.gstRateBp)}
                  </td>
                  <td className="px-4 py-3">{i.quantity}</td>
                  <td className="px-4 py-3">{formatPaise(i.lineTotalPaise)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="text-sm">
              <tr>
                <td colSpan={4} className="px-4 py-2 text-right text-gray-500">
                  Subtotal
                </td>
                <td className="px-4 py-2">
                  {formatPaise(order.subtotalPaise)}
                </td>
              </tr>
              <tr>
                <td colSpan={4} className="px-4 py-2 text-right text-gray-500">
                  GST
                </td>
                <td className="px-4 py-2">{formatPaise(order.taxPaise)}</td>
              </tr>
              <tr>
                <td colSpan={4} className="px-4 py-2 text-right text-gray-500">
                  Shipping ({order.shippingMode})
                </td>
                <td className="px-4 py-2">
                  {formatPaise(order.shippingPaise)}
                </td>
              </tr>
              <tr className="font-semibold">
                <td colSpan={4} className="px-4 py-2 text-right">
                  Total
                </td>
                <td className="px-4 py-2">{formatPaise(order.totalPaise)}</td>
              </tr>
            </tfoot>
          </table>
        </Card>

        <div className="space-y-6">
          <Card>
            <h2 className="text-sm font-semibold">Customer</h2>
            <div className="mt-2 text-sm text-gray-600">
              <p>{order.customerName}</p>
              <p>{order.customerPhone}</p>
              {order.customerEmail ? <p>{order.customerEmail}</p> : null}
              <p className="mt-2">
                {order.addressLine1}
                {order.addressLine2 ? `, ${order.addressLine2}` : ""}
                <br />
                {order.city}, {order.stateName} — {order.pincode}
              </p>
            </div>
          </Card>

          <Card>
            <h2 className="text-sm font-semibold">History</h2>
            <ol className="mt-2 space-y-1 text-xs text-gray-500">
              {order.history.map((h) => (
                <li key={h.id}>
                  {new Date(h.createdAt).toLocaleString()} —{" "}
                  {h.toStatus.replace(/_/g, " ")}
                  {h.changedBy ? ` (${h.changedBy.code})` : ""}
                  {h.reason ? ` · ${h.reason}` : ""}
                </li>
              ))}
            </ol>
            {order.holdExpiresAt && order.status === "AWAITING_PAYMENT" ? (
              <p className="mt-2 text-xs text-amber-700">
                Stock held until{" "}
                {new Date(order.holdExpiresAt).toLocaleString()}
              </p>
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  );
}
