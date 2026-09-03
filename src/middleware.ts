import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/cookie";

/**
 * Edge middleware — UX-level gate only.
 *
 * It cannot talk to the database (no Prisma on the edge), so it only checks
 * whether a session cookie is present. The authoritative check — is the
 * session valid, is the user active, do they hold the required permission —
 * happens server-side in the console layout and in every Server Action via
 * `requireAuth` / `requirePermission`.
 *
 * It also stamps `x-pathname` so server components (e.g. the storefront
 * language switcher) can return the visitor to the same page.
 */
const PROTECTED_PREFIXES = ["/app"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSessionCookie = Boolean(req.cookies.get(SESSION_COOKIE)?.value);

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (isProtected && !hasSessionCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (pathname === "/login" && hasSessionCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/app/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next();
  res.headers.set("x-pathname", pathname + req.nextUrl.search);
  return res;
}

export const config = {
  // Everything except Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)"],
};
