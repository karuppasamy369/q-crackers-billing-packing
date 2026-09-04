import { NextResponse } from "next/server";

import { db } from "@/server/db";
import { partnerLinkCodeSchema } from "@/lib/validation/payment";
import {
  PARTNER_COOKIE,
  PARTNER_COOKIE_MAX_AGE,
} from "@/lib/storefront/partner-cookie";
import { isProduction } from "@/env";

export const dynamic = "force-dynamic";

/**
 * A partner's shareable order link: `/s/pk`, `/s/psr`, `/s/ka`.
 *
 * Sets the attribution cookie for a valid, active partner code and sends the
 * visitor to the storefront home. An unknown code just redirects home with no
 * cookie (so a stale link degrades to a normal direct order).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const res = NextResponse.redirect(new URL("/", req.url));

  const parsed = partnerLinkCodeSchema.safeParse(code);
  if (parsed.success) {
    const partner = await db.user.findUnique({
      where: { code: parsed.data },
      include: { role: true },
    });
    if (partner && partner.isActive && partner.role.key === "PARTNER") {
      res.cookies.set(PARTNER_COOKIE, parsed.data, {
        path: "/",
        maxAge: PARTNER_COOKIE_MAX_AGE,
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction,
      });
    }
  }

  return res;
}
