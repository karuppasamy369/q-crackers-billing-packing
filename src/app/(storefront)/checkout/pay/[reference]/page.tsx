import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";

import { getStorefrontContext } from "@/server/storefront/context";
import { getPaymentPageContext } from "@/server/services/payments-service";
import { renderQrDataUri } from "@/server/payments/qr";
import { isAppError } from "@/server/http/errors";
import { formatPaise } from "@/lib/money";
import { env } from "@/env";
import { PayForm } from "./pay-form";
import { CashfreeCheckout } from "./cashfree-checkout";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pay for your order",
  robots: { index: false, follow: false },
};

export default async function PayPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const { t } = await getStorefrontContext();

  let ctx;
  try {
    ctx = await getPaymentPageContext(reference);
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  if (ctx.paymentStatus === "PAID" || ctx.orderStatus === "PAID") {
    redirect(`/checkout/confirmation/${ctx.reference}`);
  }

  const tp = t.payment;
  const failed =
    ctx.orderStatus === "PAYMENT_FAILED" || ctx.paymentStatus === "FAILED";
  const verifying = !failed && ctx.payment?.status === "SUBMITTED";

  const qrDataUri = ctx.upiUri ? await renderQrDataUri(ctx.upiUri) : null;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{tp.title}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {tp.orderRef}:{" "}
          <span className="font-mono">{ctx.reference.slice(0, 12)}…</span>
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 p-5">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-gray-500">{tp.amountDue}</span>
          <span className="text-2xl font-semibold">
            {formatPaise(ctx.totalPaise)}
          </span>
        </div>
        {ctx.partner?.payeeName || ctx.partner?.upiVpa ? (
          <p className="mt-2 text-sm text-gray-600">
            {tp.payTo}:{" "}
            <span className="font-medium">
              {ctx.partner.payeeName ?? ctx.partner.code}
            </span>
            {ctx.partner.upiVpa ? (
              <span className="block font-mono text-xs text-gray-500">
                {ctx.partner.upiVpa}
              </span>
            ) : null}
          </p>
        ) : null}
      </div>

      {failed ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5">
          <h2 className="text-sm font-semibold text-red-800">
            {tp.failedTitle}
          </h2>
          <p className="mt-1 text-sm text-red-700">{tp.failedBody}</p>
          <Link href="/" className="mt-3 inline-block text-sm underline">
            {t.cart.continueShopping}
          </Link>
        </div>
      ) : verifying ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-sm font-semibold text-amber-900">
            {tp.verifyingTitle}
          </h2>
          <p className="mt-1 text-sm text-amber-800">{tp.verifyingBody}</p>
          {ctx.payment?.upiReference ? (
            <p className="mt-2 font-mono text-xs text-amber-800">
              {tp.utrLabel}: {ctx.payment.upiReference}
            </p>
          ) : null}
          <Link
            href={`/checkout/confirmation/${ctx.reference}`}
            className="mt-3 inline-block text-sm underline"
          >
            {tp.viewOrder}
          </Link>
        </div>
      ) : ctx.partner?.pspProvider === "CASHFREE" ? (
        <CashfreeCheckout
          reference={ctx.reference}
          mode={env.CASHFREE_ENV === "PRODUCTION" ? "production" : "sandbox"}
          t={tp}
        />
      ) : !ctx.partner || (!ctx.partner.upiVpa && !ctx.partner.hasStaticQr) ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 text-sm text-gray-600">
          {tp.noAccount}
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-gray-200 p-5 text-center">
            {qrDataUri ? (
              <>
                <p className="mb-3 text-sm text-gray-600">{tp.scanQr}</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrDataUri}
                  alt="UPI payment QR"
                  width={240}
                  height={240}
                  className="mx-auto h-60 w-60"
                />
              </>
            ) : ctx.partner.hasStaticQr ? (
              <>
                <p className="mb-3 text-sm text-gray-600">{tp.scanQr}</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/payments/account-qr/${ctx.partner.partnerId}`}
                  alt="UPI payment QR"
                  width={240}
                  height={240}
                  className="mx-auto h-60 w-60 object-contain"
                />
              </>
            ) : null}
            {ctx.upiUri ? (
              <a
                href={ctx.upiUri}
                className="mt-4 inline-block rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
              >
                {tp.openUpiApp}
              </a>
            ) : null}
          </div>

          {ctx.partner.instructions ? (
            <div className="rounded-xl border border-gray-200 p-5 text-sm">
              <h2 className="mb-1 font-semibold">{tp.instructionsHeading}</h2>
              <p className="whitespace-pre-line text-gray-600">
                {ctx.partner.instructions}
              </p>
            </div>
          ) : null}

          <div className="rounded-xl border border-gray-200 p-5">
            <p className="mb-3 text-sm text-gray-600">{tp.afterPaying}</p>
            <PayForm reference={ctx.reference} t={t} />
          </div>
        </>
      )}
    </div>
  );
}
