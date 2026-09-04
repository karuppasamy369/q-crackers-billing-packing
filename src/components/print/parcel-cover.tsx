import type { Dictionary } from "@/lib/i18n";
import type { CoverData } from "@/server/services/booking-service";

/**
 * One A4 parcel cover / shipping label. Pure render from a customer-safe
 * {@link CoverData} — no payment, audit, or internal data. `qrDataUri` is an
 * optional pre-rendered PNG data URI of the tracking link.
 */
export function ParcelCover({
  data,
  parcelNo,
  parcelCount,
  t,
  qrDataUri,
}: {
  data: CoverData;
  parcelNo: number;
  parcelCount: number;
  t: Dictionary;
  qrDataUri: string | null;
}) {
  const c = t.cover;
  const addr = data.address;

  return (
    <section className="print-page avoid-break border-2 border-black p-6">
      {/* Header — text wordmark + business details (the project has no logo image) */}
      <header className="flex items-start justify-between border-b-2 border-black pb-3">
        <div>
          <p className="text-2xl font-extrabold tracking-tight">Q CRACKERS</p>
          {data.seller.address ? (
            <p className="mt-0.5 whitespace-pre-line text-xs text-gray-700">
              {data.seller.address}
            </p>
          ) : null}
          {data.seller.phone ? (
            <p className="text-xs text-gray-700">☎ {data.seller.phone}</p>
          ) : null}
        </div>
        <div className="text-right text-sm">
          <p className="rounded border-2 border-black px-3 py-1 text-lg font-bold">
            {c.parcel} {parcelNo} {c.of} {parcelCount}
          </p>
        </div>
      </header>

      {/* Refs */}
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <p>
          <span className="text-gray-500">{c.billNo}:</span>{" "}
          <span className="font-mono font-semibold">
            {data.billNumber ?? "—"}
          </span>
        </p>
        <p className="text-right">
          <span className="text-gray-500">{c.orderNo}:</span>{" "}
          <span className="font-mono font-semibold">{data.orderRef}</span>
        </p>
      </div>

      {/* Deliver to */}
      <div className="mt-4 rounded border border-black p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {c.deliverTo}
        </p>
        <p className="mt-1 text-xl font-bold">{data.customerName}</p>
        <p className="mt-1 text-base leading-snug">
          {addr.line1}
          {addr.line2 ? (
            <>
              <br />
              {addr.line2}
            </>
          ) : null}
          <br />
          {addr.city}, {addr.state} — <span className="font-bold">
            {addr.pincode}
          </span>
        </p>
        <p className="mt-2 text-base font-semibold">
          {c.mobile}: {data.customerPhone}
        </p>
      </div>

      {/* Courier + items + QR */}
      <div className="mt-4 flex items-start justify-between gap-4">
        <div className="space-y-1 text-sm">
          <p>
            <span className="text-gray-500">{c.courier}:</span>{" "}
            <span className="font-semibold">{data.courierName ?? "—"}</span>
          </p>
          <p>
            <span className="text-gray-500">{c.items}:</span>{" "}
            <span className="font-semibold">{data.itemCount}</span>
          </p>
          {data.notes ? (
            <p className="max-w-xs">
              <span className="text-gray-500">{c.notes}:</span> {data.notes}
            </p>
          ) : null}
        </div>
        {qrDataUri ? (
          <div className="shrink-0 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrDataUri}
              alt=""
              width={110}
              height={110}
              className="h-[110px] w-[110px]"
            />
            <p className="mt-0.5 text-[10px] text-gray-600">{c.scanToTrack}</p>
          </div>
        ) : null}
      </div>

      {/* Handling notices */}
      <footer className="mt-4 border-t-2 border-black pt-2 text-center">
        <p className="text-sm font-extrabold tracking-wide">
          {c.handleWithCare}
        </p>
        <p className="text-xs text-gray-700">{c.fireworksNotice}</p>
      </footer>
    </section>
  );
}
