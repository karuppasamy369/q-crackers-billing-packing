"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import {
  updatePaymentAccountAction,
  uploadStaticQrAction,
  removeStaticQrAction,
} from "./actions";
import type { ActionResult } from "@/server/http/action-result";

const field =
  "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900";

function Status({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return state.ok ? (
    <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
      {state.message}
    </p>
  ) : (
    <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
      {state.error}
    </p>
  );
}

export function PaymentAccountForm({
  defaults,
}: {
  defaults: {
    upiVpa: string;
    payeeName: string;
    instructions: string;
    isActive: boolean;
  };
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(updatePaymentAccountAction, null);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label htmlFor="upiVpa" className="text-sm font-medium">
          UPI ID / VPA
        </label>
        <input
          id="upiVpa"
          name="upiVpa"
          defaultValue={defaults.upiVpa}
          placeholder="name@okhdfcbank"
          autoComplete="off"
          className={field}
        />
      </div>
      <div>
        <label htmlFor="payeeName" className="text-sm font-medium">
          Payee name (shown to the customer)
        </label>
        <input
          id="payeeName"
          name="payeeName"
          defaultValue={defaults.payeeName}
          className={field}
        />
      </div>
      <div>
        <label htmlFor="instructions" className="text-sm font-medium">
          Instructions (optional)
        </label>
        <textarea
          id="instructions"
          name="instructions"
          rows={3}
          defaultValue={defaults.instructions}
          className={field}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isActive"
          value="true"
          defaultChecked={defaults.isActive}
        />
        Account active (show these details at checkout)
      </label>

      <Status state={state} />

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save payment details"}
      </button>
    </form>
  );
}

export function StaticQrControls({
  hasQr,
  partnerId,
}: {
  hasQr: boolean;
  partnerId: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadState, uploadAction, uploading] = useActionState<
    ActionResult | null,
    FormData
  >(uploadStaticQrAction, null);
  const [removeState, removeAction, removing] = useActionState<
    ActionResult | null,
    FormData
  >(removeStaticQrAction, null);

  useEffect(() => {
    if (uploadState?.ok || removeState?.ok) {
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    }
  }, [uploadState, removeState, router]);

  return (
    <div className="space-y-3">
      {hasQr ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/payments/account-qr/${partnerId}`}
            alt="Your uploaded static payment QR"
            width={180}
            height={180}
            className="mx-auto h-44 w-44 object-contain"
          />
          <form action={removeAction}>
            <button
              type="submit"
              disabled={removing}
              className="text-sm text-red-700 underline disabled:opacity-50"
            >
              {removing ? "Removing…" : "Remove static QR"}
            </button>
          </form>
        </>
      ) : (
        <p className="text-xs text-gray-500">
          No static QR uploaded. Checkout uses the generated amount-filled QR.
          Upload a screenshot of your UPI QR only if you also want that shown.
        </p>
      )}

      <form action={uploadAction} className="space-y-2">
        <input
          ref={inputRef}
          type="file"
          name="qr"
          accept="image/png,image/jpeg,image/webp"
          className="block w-full text-sm"
        />
        <button
          type="submit"
          disabled={uploading}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {uploading ? "Uploading…" : hasQr ? "Replace QR" : "Upload QR"}
        </button>
      </form>

      <Status state={uploadState ?? removeState} />
    </div>
  );
}
