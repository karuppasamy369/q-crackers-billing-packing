"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCart } from "@/components/storefront/cart-provider";
import { createOrderAction, quoteCartAction } from "./actions";
import type { OrderActionState } from "./actions";
import type { CartQuote } from "@/server/services/pricing-service";
import type { Dictionary } from "@/lib/i18n";
import { formatPaise } from "@/lib/money";
import { GST_STATE_CODES } from "@/lib/india";

const field =
  "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900";

const STATE_OPTIONS = Object.entries(GST_STATE_CODES).sort((a, b) =>
  a[1].localeCompare(b[1]),
);

export function CheckoutForm({ t }: { t: Dictionary }) {
  const { items, clear, ready } = useCart();
  const router = useRouter();
  const [quote, setQuote] = useState<CartQuote | null>(null);
  const [quoting, startQuote] = useTransition();
  const [state, formAction, pending] = useActionState<
    OrderActionState,
    FormData
  >(createOrderAction, null);

  useEffect(() => {
    if (!ready || items.length === 0) return;
    startQuote(async () => setQuote(await quoteCartAction(items)));
  }, [items, ready]);

  useEffect(() => {
    if (state?.ok) {
      clear();
      router.push(`/checkout/pay/${state.reference}`);
    }
  }, [state, clear, router]);

  if (ready && items.length === 0 && !state?.ok) {
    return (
      <div>
        <h1 className="text-xl font-semibold">{t.checkout.title}</h1>
        <p className="mt-2 text-sm text-gray-500">{t.cart.empty}</p>
        <Link href="/" className="mt-4 inline-block text-sm underline">
          {t.cart.continueShopping}
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <form action={formAction} className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">{t.checkout.title}</h1>
          <Link href="/cart" className="text-sm text-gray-500 underline">
            {t.checkout.backToCart}
          </Link>
        </div>

        <input
          type="hidden"
          name="items"
          value={JSON.stringify(items)}
          readOnly
        />

        <fieldset className="space-y-3 rounded-xl border border-gray-200 p-5">
          <legend className="px-1 text-sm font-semibold">
            {t.checkout.contactHeading}
          </legend>
          <div>
            <label htmlFor="name" className="text-sm font-medium">
              {t.checkout.name}
            </label>
            <input id="name" name="name" required className={field} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="phone" className="text-sm font-medium">
                {t.checkout.phone}
              </label>
              <input
                id="phone"
                name="phone"
                inputMode="tel"
                required
                placeholder="9876543210"
                className={field}
              />
            </div>
            <div>
              <label htmlFor="email" className="text-sm font-medium">
                {t.checkout.emailOptional}
              </label>
              <input id="email" name="email" type="email" className={field} />
            </div>
          </div>
        </fieldset>

        <fieldset className="space-y-3 rounded-xl border border-gray-200 p-5">
          <legend className="px-1 text-sm font-semibold">
            {t.checkout.deliveryHeading}
          </legend>
          <div>
            <label htmlFor="addressLine1" className="text-sm font-medium">
              {t.checkout.addressLine1}
            </label>
            <input
              id="addressLine1"
              name="addressLine1"
              required
              className={field}
            />
          </div>
          <div>
            <label htmlFor="addressLine2" className="text-sm font-medium">
              {t.checkout.addressLine2}
            </label>
            <input id="addressLine2" name="addressLine2" className={field} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="city" className="text-sm font-medium">
                {t.checkout.city}
              </label>
              <input id="city" name="city" required className={field} />
            </div>
            <div>
              <label htmlFor="stateCode" className="text-sm font-medium">
                {t.checkout.state}
              </label>
              <select
                id="stateCode"
                name="stateCode"
                required
                defaultValue="33"
                className={field}
              >
                <option value="">{t.checkout.selectState}</option>
                {STATE_OPTIONS.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="pincode" className="text-sm font-medium">
                {t.checkout.pincode}
              </label>
              <input
                id="pincode"
                name="pincode"
                inputMode="numeric"
                required
                maxLength={6}
                className={field}
              />
            </div>
          </div>
        </fieldset>

        {state?.ok === false ? (
          <p
            role="alert"
            className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {state.error}
          </p>
        ) : null}

        <p className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
          {t.checkout.paymentNote}
        </p>

        <button
          type="submit"
          disabled={pending || quoting || !quote?.fulfillable}
          className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {pending ? "…" : t.checkout.placeOrder}
        </button>
      </form>

      <aside className="h-fit rounded-xl border border-gray-200 p-5">
        <h2 className="mb-3 text-sm font-semibold">{t.checkout.summary}</h2>
        <ul className="space-y-1 text-sm">
          {quote?.lines.map((l) => (
            <li key={l.slug} className="flex justify-between gap-2">
              <span className="min-w-0 truncate text-gray-600">
                {l.name} × {l.quantity}
              </span>
              <span>{formatPaise(l.lineTotalPaise)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1 border-t border-gray-200 pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">{t.cart.subtotal}</dt>
            <dd>{formatPaise(quote?.subtotalPaise ?? 0)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">{t.cart.tax}</dt>
            <dd>{formatPaise(quote?.taxPaise ?? 0)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">{t.cart.shipping}</dt>
            <dd>
              {quote && quote.shippingPaise === 0
                ? t.cart.free
                : formatPaise(quote?.shippingPaise ?? 0)}
            </dd>
          </div>
          <div className="flex justify-between border-t border-gray-200 pt-1 text-base font-semibold">
            <dt>{t.cart.total}</dt>
            <dd>{formatPaise(quote?.totalPaise ?? 0)}</dd>
          </div>
        </dl>
      </aside>
    </div>
  );
}
