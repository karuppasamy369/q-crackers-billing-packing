import { getLrDocumentBytes } from "@/server/services/booking-service";
import { isAppError } from "@/server/http/errors";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const dynamic = "force-dynamic";

/**
 * Streams the current LR / parcel-booking PDF for an order to the console.
 * `lr.download` is enforced in the service.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await params;
  if (!UUID_RE.test(orderId)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const { data, filename } = await getLrDocumentBytes({ orderId });
    return new Response(data as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Content-Length": String(data.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (isAppError(err)) {
      return new Response(err.publicMessage, { status: err.httpStatus });
    }
    return new Response("Could not produce the document.", { status: 500 });
  }
}
