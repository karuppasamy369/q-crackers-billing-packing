import { notFound } from "next/navigation";

import { requireAuth, hasPermission } from "@/server/rbac/authorize";
import { getCoverData } from "@/server/services/booking-service";
import { isAppError } from "@/server/http/errors";
import { isLocale, getDictionary } from "@/lib/i18n";
import { renderQrDataUri } from "@/server/payments/qr";
import { ParcelCover } from "@/components/print/parcel-cover";
import { PrintToolbar } from "@/components/print/print-toolbar";
import { Forbidden } from "@/components/console/ui";

export default async function CoverPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ parcels?: string; only?: string }>;
}) {
  // This route sits outside the (console) auth-gated layout, so it must gate
  // itself. Partners always pass `booking.view`; staff only if their role /
  // per-user overrides grant it — the same check the Booking Panel uses.
  const auth = await requireAuth();
  if (!hasPermission(auth, "booking.view")) return <Forbidden />;

  const { orderId } = await params;
  const sp = await searchParams;

  let cover;
  try {
    cover = await getCoverData({
      orderId,
      parcels: sp.parcels,
      only: sp.only,
    });
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const dict = getDictionary(isLocale(cover.locale) ? cover.locale : "en");
  const qrDataUri = cover.trackingUrl
    ? await renderQrDataUri(cover.trackingUrl).catch(() => null)
    : null;

  const only = sp.only ? Number.parseInt(sp.only, 10) : undefined;
  const total = cover.parcelCount;
  const numbers =
    only && only >= 1 && only <= total
      ? [only]
      : Array.from({ length: total }, (_, i) => i + 1);

  return (
    <>
      <PrintToolbar autoPrint />
      {numbers.map((n) => (
        <ParcelCover
          key={n}
          data={cover}
          parcelNo={n}
          parcelCount={total}
          t={dict}
          qrDataUri={qrDataUri}
        />
      ))}
    </>
  );
}
