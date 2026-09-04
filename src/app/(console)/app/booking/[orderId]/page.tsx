import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAuth, hasPermission } from "@/server/rbac/authorize";
import { getBookingForConsole } from "@/server/services/booking-service";
import { isAppError } from "@/server/http/errors";
import { PageHeader, Card, Forbidden } from "@/components/console/ui";
import { formatPaise } from "@/lib/money";
import {
  MarkPackedForm,
  ParcelBookingForm,
  LrUploadForm,
  MarkCompletedForm,
} from "../booking-forms";

const STATUS_STYLES: Record<string, string> = {
  PAID: "bg-blue-100 text-blue-800",
  PACKED: "bg-amber-100 text-amber-800",
  PARCEL_BOOKED: "bg-green-100 text-green-800",
  COMPLETED: "bg-green-100 text-green-800",
};

function isoDate(d: Date | null | undefined): string {
  return d ? new Date(d).toISOString().slice(0, 10) : "";
}

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const auth = await requireAuth();
  if (!hasPermission(auth, "booking.view")) return <Forbidden />;
  const canPack = hasPermission(auth, "booking.pack");
  const canBook = hasPermission(auth, "booking.book_parcel");
  const canUpload = hasPermission(auth, "lr.upload");
  const canDownload = hasPermission(auth, "lr.download");

  const { orderId } = await params;
  let order;
  try {
    order = await getBookingForConsole({ orderId });
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const b = order.booking;
  const currentLr = b?.lrDocuments.find((d) => d.isCurrent) ?? null;
  const inBookingScope = [
    "PAID",
    "PACKED",
    "PARCEL_BOOKED",
    "COMPLETED",
  ].includes(order.status);

  const defaults = {
    courierName: b?.courierName ?? "",
    lrNumber: b?.lrNumber ?? "",
    bookingDate:
      isoDate(b?.bookingDate) || new Date().toISOString().slice(0, 10),
    parcelCount: b?.parcelCount ? String(b.parcelCount) : "1",
    remarks: b?.remarks ?? "",
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Booking · ${order.reference.slice(0, 12)}…`}
        description={`${order.customerName} · ${order.city}, ${order.stateName} — ${order.pincode}`}
      />
      <div className="flex items-center gap-3 text-sm">
        <Link
          href="/app/booking"
          className="text-gray-500 underline hover:text-gray-800"
        >
          ← Back to booking
        </Link>
        <Link
          href={`/app/orders/${order.id}`}
          className="text-gray-500 underline hover:text-gray-800"
        >
          Open order
        </Link>
        <span
          className={`rounded px-2 py-0.5 text-xs ${
            STATUS_STYLES[order.status] ?? "bg-gray-100 text-gray-600"
          }`}
        >
          {order.status.replace(/_/g, " ")}
        </span>
        {["PACKED", "PARCEL_BOOKED", "COMPLETED"].includes(order.status) ? (
          <a
            href={`/print/cover/${order.id}?parcels=${b?.parcelCount ?? 1}`}
            target="_blank"
            rel="noreferrer"
            className="ml-auto rounded-md border border-gray-300 px-3 py-1.5 font-medium hover:bg-gray-50"
          >
            🖨 Print Cover
          </a>
        ) : null}
      </div>

      {!inBookingScope ? (
        <Card className="border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-800">
            This order is {order.status.replace(/_/g, " ").toLowerCase()} and is
            not in the booking workflow.
          </p>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Item</th>
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
                    <td className="px-4 py-3">{i.quantity}</td>
                    <td className="px-4 py-3">
                      {formatPaise(i.lineTotalPaise)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
          </Card>
        </div>

        <div className="space-y-6">
          {/* Step 1 — pack */}
          {order.status === "PAID" ? (
            <Card>
              <h2 className="mb-3 text-sm font-semibold">1 · Pack the order</h2>
              {canPack ? (
                <MarkPackedForm orderId={order.id} />
              ) : (
                <p className="text-sm text-gray-500">
                  You do not have permission to mark orders as packed.
                </p>
              )}
            </Card>
          ) : null}

          {/* Step 2 — courier / LR details + confirm */}
          {order.status === "PACKED" ? (
            <Card>
              <h2 className="mb-1 text-sm font-semibold">
                2 · Courier &amp; LR details
              </h2>
              <p className="mb-3 text-xs text-gray-500">
                Packed{" "}
                {b?.packedAt ? new Date(b.packedAt).toLocaleString() : ""}
                {b?.packedBy ? ` by ${b.packedBy.code}` : ""}. Enter the details
                below, then confirm — the order moves to PARCEL BOOKED only when
                all four fields are valid.
              </p>
              {canBook ? (
                <ParcelBookingForm
                  orderId={order.id}
                  mode="confirm"
                  defaults={defaults}
                />
              ) : (
                <p className="text-sm text-gray-500">
                  You do not have permission to book parcels.
                </p>
              )}
            </Card>
          ) : null}

          {/* Booked — show details + allow edit */}
          {order.status === "PARCEL_BOOKED" && b ? (
            <Card>
              <h2 className="mb-1 text-sm font-semibold">Parcel booked</h2>
              <dl className="mb-3 space-y-1 text-sm text-gray-600">
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-400">Courier</dt>
                  <dd>{b.courierName}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-400">LR number</dt>
                  <dd className="font-mono">{b.lrNumber}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-400">Booking date</dt>
                  <dd>{isoDate(b.bookingDate)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-400">Parcels</dt>
                  <dd>{b.parcelCount}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-400">Booked</dt>
                  <dd>
                    {b.parcelBookedAt
                      ? new Date(b.parcelBookedAt).toLocaleString()
                      : ""}
                    {b.parcelBookedBy ? ` (${b.parcelBookedBy.code})` : ""}
                  </dd>
                </div>
                {b.remarks ? (
                  <div className="pt-1 text-gray-600">
                    <dt className="text-gray-400">Remarks</dt>
                    <dd className="whitespace-pre-line">{b.remarks}</dd>
                  </div>
                ) : null}
              </dl>
              {canBook ? (
                <details className="text-sm">
                  <summary className="cursor-pointer text-gray-500 underline">
                    Edit booking details
                  </summary>
                  <div className="mt-3">
                    <ParcelBookingForm
                      orderId={order.id}
                      mode="edit"
                      defaults={defaults}
                    />
                  </div>
                </details>
              ) : null}
              {canBook && currentLr ? (
                <div className="mt-3 border-t border-gray-100 pt-3">
                  <MarkCompletedForm orderId={order.id} />
                </div>
              ) : canBook ? (
                <p className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-400">
                  Upload the LR document to enable “Mark completed”.
                </p>
              ) : null}
            </Card>
          ) : null}

          {order.status === "COMPLETED" ? (
            <Card className="border-green-200 bg-green-50">
              <p className="text-sm text-green-800">This order is completed.</p>
            </Card>
          ) : null}

          {/* LR document */}
          {order.status === "PACKED" || order.status === "PARCEL_BOOKED" ? (
            <Card>
              <h2 className="mb-2 text-sm font-semibold">
                {order.status === "PARCEL_BOOKED" ? "3 · " : ""}LR / parcel PDF
              </h2>

              {currentLr ? (
                <div className="mb-3 text-sm">
                  <p className="text-gray-600">
                    Current: {currentLr.originalFilename}
                    <span className="block text-xs text-gray-400">
                      Uploaded {new Date(currentLr.uploadedAt).toLocaleString()}
                      {currentLr.uploadedBy
                        ? ` by ${currentLr.uploadedBy.code}`
                        : ""}
                    </span>
                  </p>
                  {canDownload ? (
                    <a
                      href={`/api/lr/${order.id}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
                    >
                      Download LR Copy
                    </a>
                  ) : null}
                </div>
              ) : (
                <p className="mb-3 text-sm text-gray-500">
                  No LR document uploaded yet.
                </p>
              )}

              {canUpload ? (
                <LrUploadForm
                  orderId={order.id}
                  hasCurrent={Boolean(currentLr)}
                />
              ) : null}

              {b && b.lrDocuments.length > 1 ? (
                <ul className="mt-3 space-y-1 border-t border-gray-100 pt-2 text-xs text-gray-400">
                  {b.lrDocuments
                    .filter((d) => !d.isCurrent)
                    .map((d) => (
                      <li key={d.id}>
                        {d.originalFilename} — superseded{" "}
                        {d.supersededAt
                          ? new Date(d.supersededAt).toLocaleDateString()
                          : ""}
                      </li>
                    ))}
                </ul>
              ) : null}
            </Card>
          ) : null}

          <Card>
            <h2 className="text-sm font-semibold">Customer tracking link</h2>
            <p className="mt-1 break-all font-mono text-xs text-gray-500">
              /track/{order.reference}
            </p>
            <p className="mt-1 text-xs text-gray-400">
              The customer sees packing and courier progress here, and can
              download the LR copy once it is uploaded.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
