"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cancelBillAction } from "./actions";
import { FormNotice, fieldClass } from "@/components/console/form";
import type { ActionResult } from "@/server/http/action-result";

export function CancelBill({ billId }: { billId: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(cancelBillAction, null);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={billId} />
      <label
        htmlFor="reason"
        className="block text-sm font-medium text-red-800"
      >
        Cancel this bill
      </label>
      <input
        id="reason"
        name="reason"
        required
        placeholder="Reason (required)"
        className={fieldClass}
      />
      <FormNotice state={state} />
      <button
        type="submit"
        disabled={pending}
        onClick={(e) => {
          if (
            !confirm("Cancel this bill? The number is kept and never reused.")
          )
            e.preventDefault();
        }}
        className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
      >
        Cancel bill
      </button>
    </form>
  );
}
