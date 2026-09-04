"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { verifyPaymentAction } from "./actions";
import type { ActionResult } from "@/server/http/action-result";

export function VerifyPaymentForm({
  paymentId,
  recordedUtr,
}: {
  paymentId: string;
  recordedUtr: string | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"verify" | "reject">("verify");
  const [state, formAction, pending] = useActionState<
    ActionResult<{ id: string }> | null,
    FormData
  >(verifyPaymentAction, null);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="paymentId" value={paymentId} readOnly />
      <input type="hidden" name="action" value={mode} readOnly />

      <div className="flex gap-2 text-sm">
        <button
          type="button"
          onClick={() => setMode("verify")}
          className={`rounded-md px-3 py-1.5 font-medium ${
            mode === "verify"
              ? "bg-green-600 text-white"
              : "border border-gray-300 text-gray-600"
          }`}
        >
          Verify
        </button>
        <button
          type="button"
          onClick={() => setMode("reject")}
          className={`rounded-md px-3 py-1.5 font-medium ${
            mode === "reject"
              ? "bg-red-600 text-white"
              : "border border-gray-300 text-gray-600"
          }`}
        >
          Reject
        </button>
      </div>

      {mode === "verify" ? (
        <div>
          <label htmlFor="upiReference" className="text-xs font-medium">
            Correct the UTR (optional)
          </label>
          <input
            id="upiReference"
            name="upiReference"
            defaultValue=""
            placeholder={recordedUtr ?? "as recorded"}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
      ) : null}

      <div>
        <label htmlFor="note" className="text-xs font-medium">
          {mode === "reject" ? "Reason (required)" : "Note (optional)"}
        </label>
        <textarea
          id="note"
          name="note"
          rows={2}
          required={mode === "reject"}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      {state?.ok === false ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      {state?.ok ? (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className={`w-full rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
          mode === "reject"
            ? "bg-red-600 hover:bg-red-500"
            : "bg-green-600 hover:bg-green-500"
        }`}
      >
        {pending
          ? "Working…"
          : mode === "reject"
            ? "Reject payment"
            : "Confirm money received & verify"}
      </button>
    </form>
  );
}
