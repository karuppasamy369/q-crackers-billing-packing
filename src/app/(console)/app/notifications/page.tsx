import Link from "next/link";
import { requireAuth, hasPermission } from "@/server/rbac/authorize";
import {
  listNotifications,
  getNotificationProviderStatus,
} from "@/server/services/notifications-service";
import { PageHeader, Card, Forbidden } from "@/components/console/ui";
import { RetryButton } from "./retry-button";

const STATUS_STYLES: Record<string, string> = {
  SENT: "bg-green-100 text-green-800",
  PENDING: "bg-gray-100 text-gray-600",
  SENDING: "bg-blue-100 text-blue-800",
  FAILED: "bg-amber-100 text-amber-800",
  DEAD: "bg-red-100 text-red-800",
  SKIPPED: "bg-gray-200 text-gray-500",
};

const EVENT_LABEL: Record<string, string> = {
  PAYMENT_RECEIVED: "Payment received",
  ORDER_PACKED: "Order packed",
  PARCEL_BOOKED: "Parcel booked",
  LR_AVAILABLE: "LR available",
  REVIEW_REQUEST: "Review request",
};

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    eventType?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const auth = await requireAuth();
  if (!hasPermission(auth, "notifications.manage")) return <Forbidden />;

  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const [result, provider] = await Promise.all([
    listNotifications({
      status: sp.status,
      eventType: sp.eventType,
      q: sp.q,
      page,
    }),
    Promise.resolve(getNotificationProviderStatus()),
  ]);

  const mkPage = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v) params.set(k, v);
    params.set("page", String(p));
    return `/app/notifications?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="WhatsApp notifications"
        description="Order updates sent to customers. Messages retry automatically; a delivery run is driven by a scheduled job."
      />

      <Card
        className={
          provider.configured
            ? "border-green-200 bg-green-50"
            : "border-amber-200 bg-amber-50"
        }
      >
        <p className="text-sm">
          Provider:{" "}
          <span className="font-mono font-medium">{provider.provider}</span> ·{" "}
          {provider.configured ? (
            <span className="text-green-800">configured — messages send</span>
          ) : (
            <span className="text-amber-800">
              not configured — messages are queued and will send once a provider
              is set up (via environment variables)
            </span>
          )}{" "}
          · up to {provider.maxAttempts} attempts each
        </p>
      </Card>

      <Card className="p-0">
        <form className="flex flex-wrap gap-2 border-b border-gray-200 p-3 text-sm">
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Order ref / bill no. / name"
            className="rounded-md border border-gray-300 px-2 py-1.5"
          />
          <select
            name="eventType"
            defaultValue={sp.eventType ?? ""}
            className="rounded-md border border-gray-300 px-2 py-1.5"
          >
            <option value="">Any event</option>
            {Object.entries(EVENT_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select
            name="status"
            defaultValue={sp.status ?? ""}
            className="rounded-md border border-gray-300 px-2 py-1.5"
          >
            <option value="">Any status</option>
            {["PENDING", "SENDING", "SENT", "FAILED", "DEAD", "SKIPPED"].map(
              (s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ),
            )}
          </select>
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-3 py-1.5 font-semibold text-white"
          >
            Filter
          </button>
          <Link
            href="/app/notifications"
            className="rounded-md border border-gray-300 px-3 py-1.5"
          >
            Clear
          </Link>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">To</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Attempts</th>
                <th className="px-4 py-3">Sent</th>
                <th className="px-4 py-3">Last error</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-gray-100 align-top last:border-0"
                >
                  <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    {EVENT_LABEL[r.eventType] ?? r.eventType}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/app/orders/${r.orderId}`}
                      className="font-mono text-xs underline hover:text-gray-900"
                    >
                      {r.orderNo}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{r.customerName}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    {r.recipientMasked}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${
                        STATUS_STYLES[r.status] ?? "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {r.attempts}/{r.maxAttempts}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                    {r.sentAt ? new Date(r.sentAt).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3 max-w-xs text-xs text-red-700">
                    {r.lastError ?? ""}
                  </td>
                  <td className="px-4 py-3">
                    {r.status === "FAILED" || r.status === "DEAD" ? (
                      <RetryButton id={r.id} />
                    ) : null}
                  </td>
                </tr>
              ))}
              {result.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="px-4 py-8 text-center text-gray-400"
                  >
                    No notifications yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>
          {result.total} notification{result.total === 1 ? "" : "s"} · page{" "}
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
