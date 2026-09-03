"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useCart } from "@/components/storefront/cart-provider";
import { ProductImage } from "@/components/storefront/product-card";
import { quoteCartAction } from "@/app/(storefront)/checkout/actions";
import type { CartQuote } from "@/server/services/pricing-service";
import type { Dictionary } from "@/lib/i18n";
import { formatPaise } from "@/lib/money";

export function CartView({ t }: { t: Dictionary }) {
  const { items, setQty, remove, ready } = useCart();
  const [quote, setQuote] = useState<CartQuote | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!ready) return;
    if (items.length === 0) {
      setQuote(null);
      return;
    }
    start(async () => {
      setQuote(await quoteCartAction(items));
    });
  }, [items, ready]);

  if (!ready) return <p className="text-sm text-gray-400">…</p>;

  if (items.length === 0) {
    return (
      <div>
        <h1 className="text-xl font-semibold">{t.cart.title}</h1>
        <p className="mt-2 text-sm text-gray-500">{t.cart.empty}</p>
        <Link href="/" className="mt-4 inline-block text-sm underline">
          {t.cart.continueShopping}
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div>
        <h1 className="mb-4 text-xl font-semibold">{t.cart.title}</h1>

        {quote?.issues.map((issue, i) => (
          <p
            key={`${issue.slug}-${i}`}
            className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800"
          >
            {issue.message}
          </p>
        ))}

        <ul className="divide-y divide-gray-100">
          {items.map((item) => {
            const line = quote?.lines.find((l) => l.slug === item.slug);
            const issue = quote?.issues.find((x) => x.slug === item.slug);
            return (
              <li key={item.slug} className="flex gap-3 py-4">
                <ProductImage
                  imageId={line?.primaryImageId ?? null}
                  alt={line?.name ?? item.slug}
                  className="h-20 w-20 shrink-0 rounded-lg border border-gray-200"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {line?.name ?? item.slug}
                  </p>
                  {line ? (
                    <p className="text-xs text-gray-500">
                      {formatPaise(line.unitPricePaise)} {t.cart.each}
                    </p>
                  ) : issue ? (
                    <p className="text-xs text-amber-700">{issue.message}</p>
                  ) : null}

                  <div className="mt-2 flex items-center gap-2">
                    <label className="text-xs text-gray-500">
                      {t.cart.quantity}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={item.quantity}
                      onChange={(e) =>
                        setQty(item.slug, Number(e.target.value) || 1)
                      }
                      className="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => remove(item.slug)}
                      className="text-xs text-gray-500 underline hover:text-gray-800"
                    >
                      {t.cart.remove}
                    </button>
                  </div>
                </div>
                {line ? (
                  <div className="text-sm font-medium">
                    {formatPaise(line.lineTotalPaise)}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>

        <Link href="/" className="mt-4 inline-block text-sm underline">
          {t.cart.continueShopping}
        </Link>
      </div>

      <aside className="h-fit rounded-xl border border-gray-200 p-5">
        <dl className="space-y-2 text-sm">
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
          <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-semibold">
            <dt>{t.cart.total}</dt>
            <dd>{formatPaise(quote?.totalPaise ?? 0)}</dd>
          </div>
        </dl>

        {quote && !quote.fulfillable ? (
          <p className="mt-3 text-xs text-amber-700">{t.cart.fixIssues}</p>
        ) : null}

        <Link
          href="/checkout"
          aria-disabled={!quote?.fulfillable}
          className={`mt-4 block rounded-md px-4 py-2 text-center text-sm font-semibold text-white ${
            quote?.fulfillable && !pending
              ? "bg-gray-900 hover:bg-gray-800"
              : "pointer-events-none bg-gray-300"
          }`}
        >
          {t.cart.proceed}
        </Link>
      </aside>
    </div>
  );
}
