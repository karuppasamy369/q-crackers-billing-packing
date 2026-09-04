import Link from "next/link";

import { requireAuth, hasPermission } from "@/server/rbac/authorize";
import { getReadyToBookOrders } from "@/server/services/booking-service";
import { isAppError } from "@/server/http/errors";
import { PageHeader, Card, StatTile, Forbidden } from "@/components/console/ui";
import { formatPaise } from "@/lib/money";
import { ReadyToBookTable } from "@/components/console/ready-to-book-table";

type SearchParams = Record<string, string | undefined>;

function buildQuery(sp: SearchParams, overrides: SearchParams = {}): string {
  const merged = { ...sp, ...overrides };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v) params.set(k, v);
  }
  return params.toString();
}

export default async function ReadyToBookPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const auth = await requireAuth();
  if (!hasPermission(auth, "booking.view")) return <Forbidden />;
  const canBookParcel = hasPermission(auth, "booking.book_parcel");

  const sp = await searchParams;

  let data;
  let error: string | null = null;
  try {
    data = await getReadyToBookOrders(sp);
  } catch (err) {
    if (isAppError(err) && err.code === "VALIDATION") {
      error = err.publicMessage;
      data = await getReadyToBookOrders({});
    } else {
      throw err;
    }
  }

  const { rows, summary, total, page, pageCount } = data;
  const filterQuery = buildQuery(sp, { page: undefined });
  const reportHref = `/print/ready-to-book${filterQuery ? `?${filterQuery}` : ""}`;
  const exportHref = `/app/booking/ready-to-book/export${filterQuery ? `?${filterQuery}` : ""}`;

  const rowsForTable = rows.map((r) => ({
    id: r.id,
    billNumber: r.billNumber,
    orderRef: r.orderRef,
    placedAt: r.placedAt.toISOString(),
    packedAt: r.packedAt ? r.packedAt.toISOString() : null,
    customerName: r.customerName,
    mobileMasked: r.mobileMasked,
    city: r.city,
    stateName: r.stateName,
    pincode: r.pincode,
    courierName: r.courierName,
    parcelCount: r.parcelCount,
    itemCount: r.itemCount,
    totalPaise: r.totalPaise,
    status: r.status,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ready to Book"
        description="Orders that are paid, packed, and waiting to be handed to a courier — this list updates automatically as orders move through packing and booking."
        actions={
          <div className="flex gap-2 text-sm">
            <a
              href={reportHref}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-gray-300 px-3 py-1.5 hover:bg-gray-50"
            >
              🖨 Print Consolidated Report
            </a>
            <a
              href={exportHref}
              className="rounded-md border border-gray-300 px-3 py-1.5 hover:bg-gray-50"
            >
              Export CSV
            </a>
          </div>
        }
      />

      <Card className="p-3">
        <form className="flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col">
            <span className="text-xs text-gray-500">Packed from</span>
            <input
              type="date"
              name="from"
              defaultValue={sp.from ?? ""}
              className="mt-1 rounded-md border border-gray-300 px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col">
            <span className="text-xs text-gray-500">Packed to</span>
            <input
              type="date"
              name="to"
              defaultValue={sp.to ?? ""}
              className="mt-1 rounded-md border border-gray-300 px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col">
            <span className="text-xs text-gray-500">Courier / Transport</span>
            <input
              name="courier"
              defaultValue={sp.courier ?? ""}
              className="mt-1 rounded-md border border-gray-300 px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col">
            <span className="text-xs text-gray-500">Partner</span>
            <input
              name="partnerCode"
              defaultValue={sp.partnerCode ?? ""}
              placeholder="Code"
              className="mt-1 w-24 rounded-md border border-gray-300 px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col">
            <span className="text-xs text-gray-500">City</span>
            <input
              name="city"
              defaultValue={sp.city ?? ""}
              className="mt-1 rounded-md border border-gray-300 px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col">
            <span className="text-xs text-gray-500">Pincode</span>
            <input
              name="pincode"
              defaultValue={sp.pincode ?? ""}
              className="mt-1 w-28 rounded-md border border-gray-300 px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col">
            <span className="text-xs text-gray-500">Search</span>
            <input
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="Bill / order / name / mobile"
              className="mt-1 rounded-md border border-gray-300 px-2 py-1.5"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-3 py-1.5 font-semibold text-white"
          >
            Apply Filters
          </button>
          <Link
            href="/app/booking/ready-to-book"
            className="rounded-md border border-gray-300 px-3 py-1.5"
          >
            Reset
          </Link>
          {error ? <span className="text-xs text-red-700">{error}</span> : null}
        </form>
      </Card>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Orders ready" value={summary.orders} />
        <StatTile label="Total parcels" value={summary.parcels} />
        <StatTile label="Total items" value={summary.items} />
        <StatTile
          label="Total order value"
          value={formatPaise(summary.valuePaise)}
        />
      </div>
      {summary.capped ? (
        <p className="text-xs text-amber-700">
          More than {summary.orders} orders match — totals above reflect only
          the first batch. Narrow the filters for an exact figure.
        </p>
      ) : null}

      <Card className="p-0">
        <ReadyToBookTable rows={rowsForTable} canBookParcel={canBookParcel} />
      </Card>

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>
          {total} order{total === 1 ? "" : "s"} · page {page} of {pageCount}
        </span>
        <span className="flex gap-2">
          {page > 1 ? (
            <Link
              href={`/app/booking/ready-to-book?${buildQuery(sp, { page: String(page - 1) })}`}
              className="underline"
            >
              ← Prev
            </Link>
          ) : null}
          {page < pageCount ? (
            <Link
              href={`/app/booking/ready-to-book?${buildQuery(sp, { page: String(page + 1) })}`}
              className="underline"
            >
              Next →
            </Link>
          ) : null}
        </span>
      </div>
    </div>
  );
}
