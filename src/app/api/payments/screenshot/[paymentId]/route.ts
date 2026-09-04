import { getPaymentScreenshotBytes } from "@/server/services/payments-service";
import { isAppError } from "@/server/http/errors";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const dynamic = "force-dynamic";

/**
 * Streams a customer-uploaded payment screenshot to the console for a
 * partner/staff member verifying that payment. `payments.view` is enforced
 * in the service — private, never cached, never public.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ paymentId: string }> },
) {
  const { paymentId } = await params;
  if (!UUID_RE.test(paymentId)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const result = await getPaymentScreenshotBytes({ id: paymentId });
    if (!result) return new Response("Not found", { status: 404 });

    return new Response(result.data as unknown as BodyInit, {
      headers: {
        "Content-Type": result.contentType,
        "Content-Length": String(result.data.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (isAppError(err)) {
      return new Response(err.publicMessage, { status: err.httpStatus });
    }
    return new Response("Could not produce the image.", { status: 500 });
  }
}
