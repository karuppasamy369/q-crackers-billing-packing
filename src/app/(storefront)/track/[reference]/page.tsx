import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";

import { getStorefrontContext } from "@/server/storefront/context";
import { getPublicTrackingStatus } from "@/server/services/booking-service";
import { isAppError } from "@/server/http/errors";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Track your order",
  robots: { index: false, follow: false },
};

const STEP_ORDER = ["PLACED", "PAID", "PACKED", "PARCEL_BOOKED"] as const;

export default async function TrackPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const { t } = await getStorefrontContext();

  let view;
  try {
    view = await getPublicTrackingStatus(reference);
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const tk = t.tracking;
  const failed =
    view.status === "PAYMENT_FAILED" ||
    view.status === "CANCELLED" ||
    view.status === "REFUNDED";
  const awaitingPayment = view.status === "AWAITING_PAYMENT";

  // How far along the happy path are we?
  const reached: Record<(typeof STEP_ORDER)[number], boolean> = {
    PLACED: true,
    PAID:
      Boolean(view.paidAt) ||
      ["PAID", "PACKED", "PARCEL_BOOKED", "COMPLETED"].includes(view.status),
    PACKED:
      Boolean(view.packedAt) ||
      ["PACKED", "PARCEL_BOOKED", "COMPLETED"].includes(view.status),
    PARCEL_BOOKED:
      Boolean(view.parcelBookedAt) ||
      ["PARCEL_BOOKED", "COMPLETED"].includes(view.status),
  };

  const stepLabel: Record<(typeof STEP_ORDER)[number], string> = {
    PLACED: tk.stepPlaced,
    PAID: tk.stepPaid,
    PACKED: tk.stepPacked,
    PARCEL_BOOKED: tk.stepParcelBooked,
  };
  const stepDate: Record<(typeof STEP_ORDER)[number], Date | null> = {
    PLACED: view.placedAt,
    PAID: view.paidAt,
    PACKED: view.packedAt,
    PARCEL_BOOKED: view.parcelBookedAt,
  };

  const fmtDate = (d: Date | null) =>
    d ? new Date(d).toLocaleDateString() : "";

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{tk.title}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {tk.reference}:{" "}
          <span className="font-mono">{view.reference.slice(0, 12)}…</span>
        </p>
      </div>

      <div
        className={`rounded-xl border p-4 text-sm ${
          failed
            ? "border-red-200 bg-red-50 text-red-800"
            : reached.PARCEL_BOOKED
              ? "border-green-200 bg-green-50 text-green-900"
              : "border-gray-200 bg-gray-50 text-gray-700"
        }`}
      >
        {failed
          ? awaitingPayment
            ? tk.stepPaymentFailed
            : view.status.replace(/_/g, " ")
          : awaitingPayment
            ? tk.stepPaymentPending
            : reached.PARCEL_BOOKED
              ? tk.dispatched
              : tk.awaitingDispatch}
      </div>

      {!failed && !awaitingPayment ? (
        <ol className="space-y-4">
          {STEP_ORDER.map((step) => (
            <li key={step} className="flex gap-3">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${
                  reached[step]
                    ? "bg-gray-900 text-white"
                    : "border border-gray-300 text-gray-300"
                }`}
              >
                {reached[step] ? "✓" : ""}
              </span>
              <div>
                <p
                  className={`text-sm font-medium ${
                    reached[step] ? "text-gray-900" : "text-gray-400"
                  }`}
                >
                  {stepLabel[step]}
                </p>
                {reached[step] && stepDate[step] ? (
                  <p className="text-xs text-gray-500">
                    {fmtDate(stepDate[step])}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : null}

      {view.status === "PARCEL_BOOKED" && view.courierName ? (
        <div className="rounded-xl border border-gray-200 p-5 text-sm">
          <dl className="space-y-1">
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500">{tk.courier}</dt>
              <dd className="font-medium">{view.courierName}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500">{tk.lrNumber}</dt>
              <dd className="font-mono">{view.lrNumber}</dd>
            </div>
            {view.bookingDate ? (
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">{tk.bookingDate}</dt>
                <dd>{fmtDate(view.bookingDate)}</dd>
              </div>
            ) : null}
            {view.parcelCount ? (
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">{tk.parcelCount}</dt>
                <dd>{view.parcelCount}</dd>
              </div>
            ) : null}
          </dl>

          {view.hasLrCopy ? (
            <a
              href={`/track/${view.reference}/lr-copy`}
              className="mt-4 inline-block rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
            >
              {tk.downloadLr}
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-xl border border-gray-200 p-5 text-sm">
        <h2 className="mb-1 font-semibold">{tk.deliverTo}</h2>
        <p className="text-gray-600">
          {view.deliverTo.city}, {view.deliverTo.state} —{" "}
          {view.deliverTo.pincode}
        </p>
        <p className="mt-1 text-gray-500">
          {tk.itemsCount}: {view.itemCount}
        </p>
      </div>

      <p className="text-xs text-gray-500">{tk.contactNote}</p>

      <Link href="/" className="inline-block text-sm underline">
        {t.cart.continueShopping}
      </Link>
    </div>
  );
}
