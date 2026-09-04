"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { retryNotificationAction } from "./actions";
import type { ActionResult } from "@/server/http/action-result";

export function RetryButton({ id }: { id: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<
    ActionResult | null,
    FormData
  >(retryNotificationAction, null);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={action} className="inline">
      <input type="hidden" name="id" value={id} readOnly />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
      >
        {pending ? "…" : "Retry"}
      </button>
      {state?.ok === false ? (
        <span className="ml-2 text-xs text-red-700">{state.error}</span>
      ) : null}
    </form>
  );
}
