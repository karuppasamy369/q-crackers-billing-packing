"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { moderateReviewAction } from "./actions";
import type { ActionResult } from "@/server/http/action-result";

export function ReviewRowActions({
  id,
  status,
}: {
  id: string;
  status: "PUBLISHED" | "HIDDEN";
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<
    ActionResult | null,
    FormData
  >(moderateReviewAction, null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={action}>
        <input type="hidden" name="id" value={id} readOnly />
        <input
          type="hidden"
          name="action"
          value={status === "PUBLISHED" ? "hide" : "publish"}
          readOnly
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          {status === "PUBLISHED" ? "Hide" : "Publish"}
        </button>
      </form>

      {confirmDelete ? (
        <form action={action} className="flex items-center gap-1">
          <input type="hidden" name="id" value={id} readOnly />
          <input type="hidden" name="action" value="delete" readOnly />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
          >
            Confirm delete
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            className="text-xs text-gray-500 underline"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
        >
          Delete
        </button>
      )}

      {state?.ok === false ? (
        <span className="text-xs text-red-700">{state.error}</span>
      ) : null}
    </div>
  );
}
