import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";

import { getStorefrontContext } from "@/server/storefront/context";
import { getOrderByReference } from "@/server/services/orders-service";
import { isAppError } from "@/server/http/errors";
import { formatPaise } from "@/lib/money";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Order received",
  robots: { index: false, follow: false },
};

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const { t } = await getStorefrontContext();

  let order;
  try {
    order = await getOrderByReference(reference);
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const paymentLabel =
    order.paymentStatus === "PAID"
      ? t.confirmation.paymentPaid
      : order.status === "PAYMENT_FAILED" || order.paymentStatus === "FAILED"
        ? t.confirmation.paymentFailed
        : order.status === "AWAITING_PAYMENT"
          ? t.confirmation.paymentVerifying
          : t.confirmation.paymentPending;
  const paid = order.paymentStatus === "PAID";

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div
        className={
          paid
            ? "rounded-xl border border-green-200 bg-green-50 p-5"
            : "rounded-xl border border-gray-200 bg-gray-50 p-5"
        }
      >
        <h1 className="text-lg font-semibold text-gray-900">
          {t.confirmation.title}
        </h1>
        <p className="mt-1 text-sm text-gray-700">{t.confirmation.thanks}</p>
        <p className="mt-3 text-sm">
          {t.confirmation.reference}:{" "}
          <span className="font-mono font-semibold">{order.reference}</span>
        </p>
        <p className="text-sm">
          {t.confirmation.status}:{" "}
          <span className="font-medium">{paymentLabel}</span>
        </p>
        {order.status === "AWAITING_PAYMENT" ? (
          <Link
            href={`/checkout/pay/${order.reference}`}
            className="mt-2 inline-block text-sm underline"
          >
            {t.payment.title}
          </Link>
        ) : null}
        <p className="mt-2 text-xs text-gray-600">
          {t.confirmation.contactNote}
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 p-5">
        <h2 className="mb-2 text-sm font-semibold">{t.confirmation.items}</h2>
        <ul className="space-y-1 text-sm">
          {order.items.map((i, idx) => (
            <li key={idx} className="flex justify-between gap-2">
              <span className="text-gray-600">
                {i.name} × {i.quantity}
              </span>
              <span>{formatPaise(i.lineTotalPaise)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1 border-t border-gray-200 pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">{t.cart.subtotal}</dt>
            <dd>{formatPaise(order.subtotalPaise)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">{t.cart.tax}</dt>
            <dd>{formatPaise(order.taxPaise)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">{t.cart.shipping}</dt>
            <dd>
              {order.shippingPaise === 0
                ? t.cart.free
                : formatPaise(order.shippingPaise)}
            </dd>
          </div>
          <div className="flex justify-between border-t border-gray-200 pt-1 text-base font-semibold">
            <dt>{t.cart.total}</dt>
            <dd>{formatPaise(order.totalPaise)}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-xl border border-gray-200 p-5 text-sm">
        <h2 className="mb-1 font-semibold">{t.confirmation.deliverTo}</h2>
        <p className="text-gray-600">
          {order.customerName}
          <br />
          {order.address.line1}
          {order.address.line2 ? (
            <>
              <br />
              {order.address.line2}
            </>
          ) : null}
          <br />
          {order.address.city}, {order.address.state} — {order.address.pincode}
          <br />
          {order.customerPhone}
        </p>
      </div>

      <Link href="/" className="inline-block text-sm underline">
        {t.cart.continueShopping}
      </Link>
    </div>
  );
}
