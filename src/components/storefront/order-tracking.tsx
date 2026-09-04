import type { Dictionary } from "@/lib/i18n";
import type {
  PublicTrackingDto,
  TrackingStageKey,
} from "@/server/services/tracking-service";
import { ReviewForm } from "./review-form";

const STAGE_LABEL: Record<TrackingStageKey, keyof Dictionary["tracking"]> = {
  PAYMENT: "stagePayment",
  PACKED: "stagePacked",
  PARCEL_BOOKED: "stageParcelBooked",
  LR_AVAILABLE: "stageLrAvailable",
  REVIEW: "stageReview",
};

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString() : "";
}

/**
 * The customer-safe order-tracking view. Pure render from a {@link PublicTrackingDto}
 * — it never touches the database and receives no private fields. Shared by the
 * public `/track/<token>` page and the customer's order-confirmation page.
 *
 * `lrHref` is the download URL appropriate to the calling context (token- or
 * reference-scoped); the button only renders when an LR copy actually exists.
 */
export function OrderTracking({
  dto,
  t,
  lrHref,
  reviewToken,
}: {
  dto: PublicTrackingDto;
  t: Dictionary;
  lrHref: string;
  /** Present ⇒ the customer can submit a review with this tracking token. */
  reviewToken?: string | null;
}) {
  const tk = t.tracking;

  const statusLabel = dto.cancelled
    ? tk.statusCancelled
    : dto.status === "COMPLETED"
      ? tk.statusCompleted
      : dto.status === "PARCEL_BOOKED"
        ? tk.statusParcelBooked
        : dto.status === "PACKED"
          ? tk.statusPacked
          : tk.statusPaid;

  const banner = dto.cancelled
    ? tk.bannerCancelled
    : dto.status === "COMPLETED"
      ? tk.bannerCompleted
      : dto.status === "PARCEL_BOOKED"
        ? tk.bannerDispatched
        : tk.bannerPreparing;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Q Crackers
        </p>
        <h1 className="mt-1 text-xl font-semibold">{tk.title}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {tk.refLabel}:{" "}
          <span className="font-mono font-medium text-gray-700">
            {dto.publicRef}
          </span>
        </p>
      </div>

      <div
        className={`rounded-xl border p-4 text-sm ${
          dto.cancelled
            ? "border-red-200 bg-red-50 text-red-800"
            : dto.status === "PARCEL_BOOKED" || dto.status === "COMPLETED"
              ? "border-green-200 bg-green-50 text-green-900"
              : "border-gray-200 bg-gray-50 text-gray-700"
        }`}
      >
        <p className="font-medium">{statusLabel}</p>
        <p className="mt-0.5 text-xs opacity-80">{banner}</p>
      </div>

      <ol className="space-y-4">
        {dto.stages.map((stage) => {
          const isLr = stage.key === "LR_AVAILABLE";
          const isReview = stage.key === "REVIEW";
          return (
            <li key={stage.key} className="flex gap-3">
              <span
                aria-hidden
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${
                  stage.state === "complete"
                    ? "bg-gray-900 text-white"
                    : stage.state === "current"
                      ? "border-2 border-gray-900 text-gray-900"
                      : "border border-gray-300 text-gray-300"
                }`}
              >
                {stage.state === "complete" ? "✓" : ""}
              </span>
              <div className="min-w-0">
                <p
                  className={`text-sm font-medium ${
                    stage.state === "pending"
                      ? "text-gray-400"
                      : "text-gray-900"
                  }`}
                >
                  {tk[STAGE_LABEL[stage.key]]}
                </p>
                {stage.state === "complete" && stage.at ? (
                  <p className="text-xs text-gray-500">{fmtDate(stage.at)}</p>
                ) : stage.state === "current" ? (
                  <p className="text-xs text-gray-500">{tk.stateCurrent}</p>
                ) : (
                  <p className="text-xs text-gray-400">{tk.statePending}</p>
                )}

                {isLr && stage.state !== "complete" && !dto.cancelled ? (
                  <p className="mt-1 text-xs text-gray-400">{tk.lrPending}</p>
                ) : null}
                {isLr && dto.lrAvailable ? (
                  <a
                    href={lrHref}
                    className="mt-2 inline-block rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
                  >
                    {tk.downloadLr}
                  </a>
                ) : null}
                {isReview && dto.review ? (
                  <div className="mt-1 text-xs text-gray-600">
                    <p>
                      {t.review.yourRating}:{" "}
                      <span className="text-amber-500">
                        {"★".repeat(dto.review.rating)}
                        <span className="text-gray-300">
                          {"★".repeat(5 - dto.review.rating)}
                        </span>
                      </span>
                    </p>
                    {dto.review.comment ? (
                      <p className="mt-1 whitespace-pre-line text-gray-500">
                        “{dto.review.comment}”
                      </p>
                    ) : null}
                  </div>
                ) : isReview && dto.canReview && reviewToken ? (
                  <ReviewForm token={reviewToken} t={t} />
                ) : isReview && !dto.cancelled ? (
                  <p className="mt-1 text-xs text-gray-400">
                    {dto.canReview ? tk.reviewPending : t.review.notEligible}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {!dto.cancelled && dto.status === "PARCEL_BOOKED" && dto.courierName ? (
        <div className="rounded-xl border border-gray-200 p-5 text-sm">
          <dl className="space-y-1">
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500">{tk.courier}</dt>
              <dd className="font-medium">{dto.courierName}</dd>
            </div>
            {dto.lrNumber ? (
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">{tk.lrNumber}</dt>
                <dd className="font-mono">{dto.lrNumber}</dd>
              </div>
            ) : null}
            {dto.bookingDate ? (
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">{tk.bookingDate}</dt>
                <dd>{fmtDate(dto.bookingDate)}</dd>
              </div>
            ) : null}
            {dto.parcelCount ? (
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">{tk.parcelCount}</dt>
                <dd>{dto.parcelCount}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}

      <div className="rounded-xl border border-gray-200 p-5 text-sm text-gray-600">
        {dto.destination ? (
          <p>
            <span className="text-gray-400">{tk.destination}:</span>{" "}
            {dto.destination.city}, {dto.destination.state}
          </p>
        ) : null}
        <p>
          <span className="text-gray-400">{tk.items}:</span> {dto.itemCount}
        </p>
        {dto.cancelled ? (
          <p className="mt-2 text-red-700">{tk.cancelledNote}</p>
        ) : null}
      </div>

      <p className="text-xs text-gray-500">{tk.contactNote}</p>
    </div>
  );
}

/** The generic, information-free state for an invalid / expired / revoked link. */
export function TrackingInvalid({ t }: { t: Dictionary }) {
  const tk = t.tracking;
  return (
    <div className="mx-auto max-w-md space-y-3 py-8 text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        Q Crackers
      </p>
      <h1 className="text-lg font-semibold text-gray-900">{tk.invalidTitle}</h1>
      <p className="text-sm text-gray-600">{tk.invalidBody}</p>
    </div>
  );
}
