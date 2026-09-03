import "server-only";

import { headers } from "next/headers";

/** Current request path (+ query), stamped by middleware as `x-pathname`. */
export async function currentPathname(): Promise<string> {
  const h = await headers();
  const p = h.get("x-pathname");
  return p && p.startsWith("/") ? p : "/";
}
