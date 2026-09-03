import { getCurrentAuth } from "@/server/auth/session";
import { loadProductImageBytes } from "@/server/services/products-service";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Serves product image bytes. Storage stays private — this route is the only
 * way to read an image, and it enforces:
 *   - published product (active + online): anyone may view
 *   - otherwise: caller needs the `products.view` permission
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ imageId: string }> },
) {
  const { imageId } = await params;
  if (!UUID_RE.test(imageId)) {
    return new Response("Not found", { status: 404 });
  }

  const auth = await getCurrentAuth();
  const authView = Boolean(auth && auth.permissions.has("products.view"));

  const result = await loadProductImageBytes(imageId, authView);
  if (result === "not_found") return new Response("Not found", { status: 404 });
  if (result === "forbidden") return new Response("Forbidden", { status: 403 });

  return new Response(result.data as unknown as BodyInit, {
    headers: {
      "Content-Type": result.contentType,
      "Content-Length": String(result.data.length),
      "Cache-Control": result.public
        ? "public, max-age=3600, stale-while-revalidate=86400"
        : "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
