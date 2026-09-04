"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { submitPaymentAction, type PaymentActionState } from "../../actions";
import type { Dictionary } from "@/lib/i18n";

const field =
  "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900";

export function PayForm({
  reference,
  t,
}: {
  reference: string;
  t: Dictionary;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    PaymentActionState,
    FormData
  >(submitPaymentAction, null);

  useEffect(() => {
    if (state?.ok) {
      if (state.status === "already_paid") {
        router.push(`/checkout/confirmation/${reference}`);
      } else {
        router.refresh();
      }
    }
  }, [state, reference, router]);

  const tp = t.payment;

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="reference" value={reference} readOnly />

      <div>
        <label htmlFor="upiReference" className="text-sm font-medium">
          {tp.utrLabel}
        </label>
        <input
          id="upiReference"
          name="upiReference"
          required
          autoComplete="off"
          inputMode="numeric"
          placeholder="123456789012"
          className={field}
        />
        <p className="mt-1 text-xs text-gray-500">{tp.utrHelp}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="payerName" className="text-sm font-medium">
            {tp.payerNameOptional}
          </label>
          <input id="payerName" name="payerName" className={field} />
        </div>
        <div>
          <label htmlFor="payerVpa" className="text-sm font-medium">
            {tp.payerVpaOptional}
          </label>
          <input
            id="payerVpa"
            name="payerVpa"
            autoComplete="off"
            placeholder="name@bank"
            className={field}
          />
        </div>
      </div>

      <div>
        <label htmlFor="screenshot" className="text-sm font-medium">
          {tp.screenshotOptional}
        </label>
        <input
          id="screenshot"
          name="screenshot"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="mt-1 block w-full text-sm"
        />
        <p className="mt-1 text-xs text-gray-500">{tp.screenshotHelp}</p>
      </div>

      {state?.ok === false ? (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {pending ? tp.submitting : tp.submit}
      </button>
    </form>
  );
}
