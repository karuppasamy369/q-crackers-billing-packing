"use server";

import { cookies } from "next/headers";

import { quoteCart, type CartQuote } from "@/server/services/pricing-service";
import { createOnlineOrder } from "@/server/services/orders-service";
import { submitPayment } from "@/server/services/payments-service";
import { rotateTrackingTokenByReference } from "@/server/services/tracking-service";
import { env } from "@/env";
import { isAppError } from "@/server/http/errors";
import type { CartItemInput } from "@/lib/validation/checkout";
import { PARTNER_COOKIE } from "@/lib/storefront/partner-cookie";
import { LOCALE_COOKIE } from "@/lib/i18n";

export type OrderActionState =
  | { ok: true; reference: string }
  | { ok: false; error: string }
  | null;

export type PaymentActionState =
  | { ok: true; status: "submitted" | "already_submitted" | "already_paid" }
  | { ok: false; error: string }
  | null;

/** Server-authoritative cart quote for the cart / checkout pages. */
export async function quoteCartAction(
  items: CartItemInput[],
): Promise<CartQuote> {
  return quoteCart(items);
}

function parseItems(raw: FormDataEntryValue | null): CartItemInput[] {
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((e) => ({
        slug: String(e?.slug ?? ""),
        quantity: Number(e?.quantity ?? 0),
      }))
      .filter((e) => e.slug && Number.isFinite(e.quantity));
  } catch {
    return [];
  }
}

export async function createOrderAction(
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  try {
    const jar = await cookies();
    const partnerCode = jar.get(PARTNER_COOKIE)?.value ?? null;
    const locale = jar.get(LOCALE_COOKIE)?.value ?? null;

    const { reference } = await createOnlineOrder(
      {
        items: parseItems(formData.get("items")),
        customer: {
          name: formData.get("name"),
          phone: formData.get("phone"),
          email: formData.get("email") || undefined,
          addressLine1: formData.get("addressLine1"),
          addressLine2: formData.get("addressLine2") || undefined,
          city: formData.get("city"),
          stateCode: formData.get("stateCode"),
          pincode: formData.get("pincode"),
        },
      },
      { partnerCode, locale },
    );
    return { ok: true, reference };
  } catch (err) {
    return {
      ok: false,
      error: isAppError(err)
        ? err.publicMessage
        : "We could not place your order. Please try again.",
    };
  }
}

export type TrackingLinkActionState =
  | { ok: true; url: string }
  | { ok: false; error: string }
  | null;

/**
 * Reveal (by rotating) the shareable tracking link for the customer's own
 * order. Authorised by the order reference the customer already holds.
 */
export async function revealTrackingLinkAction(
  _prev: TrackingLinkActionState,
  formData: FormData,
): Promise<TrackingLinkActionState> {
  try {
    const reference = String(formData.get("reference") ?? "");
    const { token } = await rotateTrackingTokenByReference(reference);
    const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
    return { ok: true, url: `${base}/track/${token}` };
  } catch (err) {
    return {
      ok: false,
      error: isAppError(err)
        ? err.publicMessage
        : "We could not generate a tracking link. Please try again.",
    };
  }
}

export async function submitPaymentAction(
  _prev: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  try {
    const file = formData.get("screenshot");
    const screenshot =
      file instanceof File && file.size > 0
        ? { bytes: new Uint8Array(await file.arrayBuffer()), filename: file.name }
        : null;

    const result = await submitPayment(
      formData.get("reference"),
      {
        upiReference: formData.get("upiReference"),
        payerName: formData.get("payerName") || undefined,
        payerVpa: formData.get("payerVpa") || undefined,
      },
      screenshot,
    );
    return { ok: true, status: result.status };
  } catch (err) {
    return {
      ok: false,
      error: isAppError(err)
        ? err.publicMessage
        : "We could not record your payment. Please try again.",
    };
  }
}
