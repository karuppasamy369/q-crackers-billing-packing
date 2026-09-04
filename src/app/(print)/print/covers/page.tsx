import { requireAuth, hasPermission } from "@/server/rbac/authorize";
import { getCoverDataBulk } from "@/server/services/booking-service";
import { isLocale, getDictionary } from "@/lib/i18n";
import { renderQrDataUri } from "@/server/payments/qr";
import { ParcelCover } from "@/components/print/parcel-cover";
import { PrintToolbar } from "@/components/print/print-toolbar";
import { Forbidden, Card } from "@/components/console/ui";

/**
 * Bulk cover printing for a set of selected orders (`?ids=a,b,c`). Presentation
 * only — no mutation, no new bulk-booking logic. Orders that are not eligible
 * for a cover (not paid/packed, or not found) are silently skipped so one bad
 * id in the selection does not break the whole print run.
 */
export default async function BulkCoverPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const auth = await requireAuth();
  if (!hasPermission(auth, "booking.view")) return <Forbidden />;

  const sp = await searchParams;
  const orderIds = (sp.ids ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (orderIds.length === 0) {
    return (
      <Card>
        <p className="text-sm text-gray-500">
          No orders were selected for printing.
        </p>
      </Card>
    );
  }

  const covers = await getCoverDataBulk({ orderIds });

  const withQr = await Promise.all(
    covers.map(async (cover) => ({
      cover,
      qrDataUri: cover.trackingUrl
        ? await renderQrDataUri(cover.trackingUrl).catch(() => null)
        : null,
    })),
  );

  return (
    <>
      <PrintToolbar autoPrint />
      {withQr.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-500">
            None of the selected orders are eligible for a parcel cover right
            now (an order must be paid and packed).
          </p>
        </Card>
      ) : null}
      {withQr.map(({ cover, qrDataUri }) => {
        const dict = getDictionary(isLocale(cover.locale) ? cover.locale : "en");
        const total = cover.parcelCount;
        return Array.from({ length: total }, (_, i) => i + 1).map((n) => (
          <ParcelCover
            key={`${cover.orderId}-${n}`}
            data={cover}
            parcelNo={n}
            parcelCount={total}
            t={dict}
            qrDataUri={qrDataUri}
          />
        ));
      })}
    </>
  );
}
