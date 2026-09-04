"use client";

import { useState } from "react";
import Script from "next/script";
import { createCashfreeSessionAction } from "../../actions";

declare global {
  interface Window {
    Cashfree?: (opts: { mode: "sandbox" | "production" }) => {
      checkout: (opts: {
        paymentSessionId: string;
        redirectTarget?: "_self" | "_blank" | "_modal";
      }) => Promise<unknown>;
    };
  }
}

/**
 * Cashfree's own hosted checkout — the customer pays a real, PSP-verified
 * UPI intent/QR, not a personal VPA we generated. Payment confirmation comes
 * from the server-to-server webhook (`/api/payments/webhook/cashfree`), never
 * from this component or the redirect back here; this page just starts the
 * checkout and otherwise shows whatever the order's current status already
 * is (see the parent page — it keeps polling/reflects "verifying" until the
 * order is actually PAID).
 *
 * NOTE: verify the exact `Cashfree(...)`/`.checkout(...)` call shape against
 * Cashfree's current integration snippet (Dashboard -> Developers -> Web
 * integration) before taking a partner live — SDK call signatures do drift
 * between versions.
 */
export function CashfreeCheckout({
  reference,
  mode,
  t,
}: {
  reference: string;
  mode: "sandbox" | "production";
  t: { payNow: string; payNowStarting: string; autoVerifyNote: string; error: string };
}) {
  const [sdkReady, setSdkReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout() {
    setError(null);
    setPending(true);
    try {
      const result = await createCashfreeSessionAction(reference);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const factory = window.Cashfree;
      if (!factory) {
        setError(t.error);
        return;
      }
      const cashfree = factory({ mode });
      await cashfree.checkout({
        paymentSessionId: result.paymentSessionId,
        redirectTarget: "_self",
      });
    } catch {
      setError(t.error);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 p-5 text-center">
      <Script
        src="https://sdk.cashfree.com/js/v3/cashfree.js"
        strategy="afterInteractive"
        onLoad={() => setSdkReady(true)}
      />
      <p className="mb-3 text-sm text-gray-600">{t.autoVerifyNote}</p>
      <button
        type="button"
        onClick={startCheckout}
        disabled={pending || !sdkReady}
        className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {pending ? t.payNowStarting : t.payNow}
      </button>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
