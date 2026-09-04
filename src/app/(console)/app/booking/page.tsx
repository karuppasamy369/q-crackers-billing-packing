import Link from "next/link";
import { requireAuth, hasPermission } from "@/server/rbac/authorize";
import { listBookingOrders } from "@/server/services/booking-service";
import { PageHeader, Card, Forbidden } from "@/components/console/ui";

const STATUS_STYLES: Record<string, string> = {
  PAID: "bg-blue-100 text-blue-800",
  PACKED: "bg-amber-100 text-amber-800",
  PARCEL_BOOKED: "bg-green-100 text-green-800",
};

export default async function BookingPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const auth = await requireAuth();
  if (!hasPermission(auth, "booking.view")) return <Forbidden />;

  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const result = await listBookingOrders({
    q: sp.q,
    status: sp.status,
    page,
  });

  const mkPage = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v) params.set(k, v);
    params.set("page", String(p));
    return `/app/booking?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Booking"
        description="Paid orders waiting to be packed and handed to a courier. Work top to bottom: pack, enter the courier / LR details, upload the LR PDF."
        actions={
          <Link
            href="/app/booking/ready-to-book"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Ready to Book →
          </Link>
        }
      />

      <Card className="p-0">
        <form className="flex flex-wrap gap-2 border-b border-gray-200 p-3 text-sm">
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Order ref / name / phone / LR no."
            className="rounded-md border border-gray-300 px-2 py-1.5"
          />
          <select
            name="status"
            defaultValue={sp.status ?? ""}
            className="rounded-md border border-gray-300 px-2 py-1.5"
          >
            <option value="">Any stage</option>
            <option value="PAID">Paid — to pack</option>
            <option value="PACKED">Packed — to book</option>
            <option value="PARCEL_BOOKED">Parcel booked</option>
          </select>
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-3 py-1.5 font-semibold text-white"
          >
            Filter
          </button>
          <Link
            href="/app/booking"
            className="rounded-md border border-gray-300 px-3 py-1.5"
          >
            Clear
          </Link>
        </form>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">Placed</th>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Destination</th>
              <th className="px-4 py-3">Stage</th>
              <th className="px-4 py-3">Courier / LR</th>
              <th className="px-4 py-3">LR PDF</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {result.rows.map((o) => (
              <tr key={o.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                  {new Date(o.placedAt).toLocaleDateString()}
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
                <td className="px-4 py-3 text-gray-600">
                  {o.city}, {o.stateName}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      STATUS_STYLES[o.status] ?? "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {o.status.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs">
                  {o.booking?.parcelBookedAt ? (
                    <>
                      {o.booking.courierName}
                      <span className="block font-mono text-gray-500">
                        {o.booking.lrNumber}
                      </span>
                    </>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs">
                  {(o.booking?.lrDocuments.length ?? 0) > 0 ? (
                    <span className="text-green-700">uploaded</span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/app/booking/${o.id}`}
                    className="text-gray-700 underline hover:text-gray-900"
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {result.rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  No orders in the booking queue.
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
