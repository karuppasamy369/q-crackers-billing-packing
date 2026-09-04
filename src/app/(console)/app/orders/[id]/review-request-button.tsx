"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { requestReviewAction } from "../../notifications/actions";
import type { ActionResult } from "@/server/http/action-result";

export function ReviewRequestButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<
    ActionResult | null,
    FormData
  >(requestReviewAction, null);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={action} className="mt-2">
      <input type="hidden" name="orderId" value={orderId} readOnly />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
      >
        {pending ? "Working…" : "Send review request"}
      </button>
      {state?.ok ? (
        <p className="mt-1 text-xs text-green-700">{state.message}</p>
      ) : null}
      {state?.ok === false ? (
        <p className="mt-1 text-xs text-red-700">{state.error}</p>
      ) : null}
    </form>
  );
}
