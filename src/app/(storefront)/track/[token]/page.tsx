import type { Metadata } from "next";
import Link from "next/link";

import { getStorefrontContext } from "@/server/storefront/context";
import { getPublicTrackingByToken } from "@/server/services/tracking-service";
import { isAppError } from "@/server/http/errors";
import {
  OrderTracking,
  TrackingInvalid,
} from "@/components/storefront/order-tracking";

// Always render fresh so booking / LR updates show immediately.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Track your order",
  robots: { index: false, follow: false },
};

export default async function TrackByTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { t } = await getStorefrontContext();

  let dto;
  try {
    dto = await getPublicTrackingByToken(token);
  } catch (err) {
    if (isAppError(err) && err.code === "RATE_LIMITED") {
      return (
        <div className="mx-auto max-w-md py-8 text-center text-sm text-gray-600">
          {err.publicMessage}
        </div>
      );
    }
    if (isAppError(err) && err.code === "NOT_FOUND") {
      return (
        <div className="mx-auto max-w-lg">
          <TrackingInvalid t={t} />
        </div>
      );
    }
    throw err;
  }

  return (
    <div className="mx-auto max-w-lg">
      <OrderTracking
        dto={dto}
        t={t}
        lrHref={`/track/${encodeURIComponent(token)}/lr-copy`}
      />
      <Link
        href="/"
        className="mt-6 inline-block text-sm text-gray-500 underline hover:text-gray-800"
      >
        {t.cart.continueShopping}
      </Link>
    </div>
  );
}
