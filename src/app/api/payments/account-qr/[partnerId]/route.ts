import { loadStaticQrBytes } from "@/server/services/payment-accounts-service";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const dynamic = "force-dynamic";

/**
 * Serves a partner's uploaded static payment QR. Public — the QR is meant to
 * be shown to paying customers — but only for an active partner account.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ partnerId: string }> },
) {
  const { partnerId } = await params;
  if (!UUID_RE.test(partnerId)) {
    return new Response("Not found", { status: 404 });
  }

  const result = await loadStaticQrBytes(partnerId);
  if (!result) return new Response("Not found", { status: 404 });

  return new Response(result.data as unknown as BodyInit, {
    headers: {
      "Content-Type": result.contentType,
      "Content-Length": String(result.data.length),
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
