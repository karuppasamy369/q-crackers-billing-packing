import { getPublicLrCopy } from "@/server/services/booking-service";
import { isAppError } from "@/server/http/errors";

export const dynamic = "force-dynamic";

/**
 * Customer download of their LR copy, reached from the tracking page. The
 * random order reference is the bearer capability; the service rate-limits by
 * IP and only serves it once a current LR document exists.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ reference: string }> },
) {
  const { reference } = await params;

  try {
    const { data, filename } = await getPublicLrCopy(reference);
    return new Response(data as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
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
