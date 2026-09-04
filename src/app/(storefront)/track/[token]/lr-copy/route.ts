import { getPublicTrackingLrByToken } from "@/server/services/tracking-service";
import { isAppError } from "@/server/http/errors";

export const dynamic = "force-dynamic";

/**
 * Customer download of the LR / parcel PDF via the tracking token. The service
 * rate-limits, resolves the order only through the token hash, and serves the
 * bytes only when a current LR document exists for that exact order. Any
 * failure returns a plain generic response — no order details leak.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  try {
    const { data, filename } = await getPublicTrackingLrByToken(token);
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
