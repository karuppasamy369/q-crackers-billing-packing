import { getPublicTrackingLrByReference } from "@/server/services/tracking-service";
import { isAppError } from "@/server/http/errors";

export const dynamic = "force-dynamic";

/**
 * LR / parcel PDF download for the customer's own order-confirmation page.
 * Authorised by the order reference in the URL (the same bearer capability the
 * confirmation page itself uses); the service rate-limits and only serves the
 * bytes when a current LR document exists for that order.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ reference: string }> },
) {
  const { reference } = await params;

  try {
    const { data, filename } = await getPublicTrackingLrByReference(reference);
    return new Response(data as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(data.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (err) {
    if (isAppError(err) && err.code === "RATE_LIMITED") {
      return new Response(err.publicMessage, { status: 429 });
    }
    return new Response("Not found", { status: 404 });
  }
}
