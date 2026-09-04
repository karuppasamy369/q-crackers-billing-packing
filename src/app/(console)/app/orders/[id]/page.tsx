import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth, hasPermission } from "@/server/rbac/authorize";
import { getOrderForConsole } from "@/server/services/orders-service";
import { getTrackingAdminInfo } from "@/server/services/tracking-service";
import { getOrderNotifications } from "@/server/services/notifications-service";
import { isAppError } from "@/server/http/errors";
import { PageHeader, Card, Forbidden } from "@/components/console/ui";
import { formatPaise, formatGstRateBp } from "@/lib/money";
import { TrackingPanel } from "./tracking-panel";
import { ReviewRequestButton } from "./review-request-button";

const NOTIF_BADGE: Record<string, string> = {
  SENT: "bg-green-100 text-green-800",
  PENDING: "bg-gray-100 text-gray-600",
  SENDING: "bg-blue-100 text-blue-800",
  FAILED: "bg-amber-100 text-amber-800",
  DEAD: "bg-red-100 text-red-800",
  SKIPPED: "bg-gray-200 text-gray-500",
};

const PAYMENT_BADGE: Record<string, string> = {
  SUBMITTED: "bg-amber-100 text-amber-800",
  VERIFIED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  FAILED: "bg-gray-200 text-gray-700",
  INITIATED: "bg-gray-100 text-gray-600",
};

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const auth = await requireAuth();
  if (!hasPermission(auth, "orders.view")) return <Forbidden />;
  const canViewPayments = hasPermission(auth, "payments.view");
  const canViewBooking = hasPermission(auth, "booking.view");
  const canManageNotifications = hasPermission(auth, "notifications.manage");

  const { id } = await params;
  let order;
  try {
    order = await getOrderForConsole(id);
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  const [trackingInfo, notifications] = await Promise.all([
    getTrackingAdminInfo(order.id),
    getOrderNotifications(order.id),
  ]);
  const reviewEligible =
    order.paymentStatus === "PAID" &&
    ["PARCEL_BOOKED", "COMPLETED"].includes(order.status);
  const reviewAlreadyQueued = notifications.some(
    (n) => n.eventType === "REVIEW_REQUEST",
  );

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
            <h2 className="text-sm font-semibold">Partner &amp; payment</h2>
            <div className="mt-2 space-y-1 text-sm text-gray-600">
              <p>
                Assigned partner:{" "}
                <span className="font-mono">
                  {order.assignedPartnerCode ?? "—"}
                </span>
                {order.assignedPartner ? ` (${order.assignedPartner.name})` : ""}
              </p>
              <p>
                Payment status:{" "}
                <span className="font-medium">
                  {order.paymentStatus.toLowerCase()}
                </span>
              </p>
              {order.bill ? (
                <p>
                  Bill:{" "}
                  <Link
                    href={`/app/billing/${order.bill.id}`}
                    className="underline hover:text-gray-900"
                  >
                    {order.bill.billNumber}
                  </Link>
                </p>
              ) : null}
            </div>
            {order.payments.length > 0 ? (
              <ul className="mt-3 space-y-2 border-t border-gray-100 pt-3 text-xs">
                {order.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between">
                    <span>
                      <span
                        className={`rounded px-1.5 py-0.5 ${
                          PAYMENT_BADGE[p.status] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {p.status}
                      </span>{" "}
                      <span className="font-mono">{p.upiReference ?? "—"}</span>{" "}
                      {formatPaise(p.amountPaise)}
                    </span>
                    {canViewPayments ? (
                      <Link
                        href={`/app/payments/${p.id}`}
                        className="underline hover:text-gray-900"
                      >
                        Open
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>

          {["PAID", "PACKED", "PARCEL_BOOKED", "COMPLETED"].includes(
            order.status,
          ) ? (
            <Card>
              <h2 className="text-sm font-semibold">Booking</h2>
              <div className="mt-2 space-y-1 text-sm text-gray-600">
                <p>
                  Stage:{" "}
                  <span className="font-medium">
                    {order.status.replace(/_/g, " ")}
                  </span>
                </p>
                {order.booking?.parcelBookedAt ? (
                  <>
                    <p>
                      Courier:{" "}
                      <span className="font-medium">
                        {order.booking.courierName}
                      </span>
                    </p>
                    <p>
                      LR:{" "}
                      <span className="font-mono">
                        {order.booking.lrNumber}
                      </span>
                    </p>
                  </>
                ) : null}
                {(order.booking?.lrDocuments.length ?? 0) > 0 ? (
                  <p className="text-xs text-green-700">LR PDF uploaded</p>
                ) : null}
              </div>
              {canViewBooking &&
              ["PAID", "PACKED", "PARCEL_BOOKED"].includes(order.status) ? (
                <Link
                  href={`/app/booking/${order.id}`}
                  className="mt-2 inline-block text-sm underline hover:text-gray-900"
                >
                  Open booking panel
                </Link>
              ) : null}
            </Card>
          ) : null}

          {trackingInfo.eligible || trackingInfo.status !== "none" ? (
            <Card>
              <h2 className="mb-2 text-sm font-semibold">Customer tracking</h2>
              <TrackingPanel
                orderId={order.id}
                info={trackingInfo}
                canManage={hasPermission(auth, "tracking.manage")}
              />
            </Card>
          ) : null}

          {notifications.length > 0 || reviewEligible ? (
            <Card>
              <h2 className="mb-2 text-sm font-semibold">
                WhatsApp notifications
              </h2>
              {notifications.length > 0 ? (
                <ul className="space-y-1.5 text-xs">
                  {notifications.map((n) => (
                    <li
                      key={n.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="text-gray-600">
                        {n.eventType.replace(/_/g, " ").toLowerCase()}
                      </span>
                      <span className="flex items-center gap-2">
                        {n.status === "SENT" && n.sentAt ? (
                          <span className="text-gray-400">
                            {new Date(n.sentAt).toLocaleDateString()}
                          </span>
                        ) : null}
                        <span
                          className={`rounded px-1.5 py-0.5 ${
                            NOTIF_BADGE[n.status] ?? "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {n.status}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-gray-500">
                  No notifications for this order yet.
                </p>
              )}

              {canManageNotifications &&
              reviewEligible &&
              !reviewAlreadyQueued ? (
                <ReviewRequestButton orderId={order.id} />
              ) : null}
              {reviewAlreadyQueued ? (
                <p className="mt-2 text-xs text-gray-400">
                  Review request queued.
                </p>
              ) : null}
            </Card>
          ) : null}

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
