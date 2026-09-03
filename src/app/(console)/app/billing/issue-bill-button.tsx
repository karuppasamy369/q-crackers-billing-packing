"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { issueBillForOrderAction } from "./actions";

export function IssueBillButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await issueBillForOrderAction(orderId);
            if (r.ok && r.data) router.push(`/app/billing/${r.data.id}`);
            else if (!r.ok) setError(r.error);
          })
        }
        className="rounded-md border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-50"
      >
        {pending ? "…" : "Generate bill"}
      </button>
      {error ? (
        <span className="ml-2 text-xs text-red-700">{error}</span>
      ) : null}
    </span>
  );
}
