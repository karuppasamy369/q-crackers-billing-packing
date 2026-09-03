"use server";

import { quoteCart, type CartQuote } from "@/server/services/pricing-service";
import { createOnlineOrder } from "@/server/services/orders-service";
import { isAppError } from "@/server/http/errors";
import type { CartItemInput } from "@/lib/validation/checkout";

export type OrderActionState =
  | { ok: true; reference: string }
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
    const { reference } = await createOnlineOrder({
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
    });
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
