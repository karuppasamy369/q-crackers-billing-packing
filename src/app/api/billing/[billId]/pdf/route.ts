import { getBillPdfBytes } from "@/server/services/billing-service";
import { isAppError } from "@/server/http/errors";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const dynamic = "force-dynamic";

/** Streams a bill PDF. `billing.view` required (enforced in the service). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ billId: string }> },
) {
  const { billId } = await params;
  if (!UUID_RE.test(billId)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const { data, filename } = await getBillPdfBytes({ id: billId });
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
    return new Response("Could not produce the PDF.", { status: 500 });
  }
}
