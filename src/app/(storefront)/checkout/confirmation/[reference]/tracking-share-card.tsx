"use client";

import { useActionState, useEffect, useState } from "react";

import {
  revealTrackingLinkAction,
  type TrackingLinkActionState,
} from "../../actions";
import type { Dictionary } from "@/lib/i18n";

/**
 * The shareable tracking link on the order-confirmation page. The link is
 * revealed (by rotating the token) on demand — its raw value is never stored,
 * so each reveal produces a fresh link and older links stop working.
 */
export function TrackingShareCard({
  reference,
  initialUrl,
  t,
}: {
  reference: string;
  initialUrl: string | null;
  t: Dictionary;
}) {
  const tk = t.tracking;
  const [state, formAction, pending] = useActionState<
    TrackingLinkActionState,
    FormData
  >(revealTrackingLinkAction, null);
  const [copied, setCopied] = useState(false);

  const url = state?.ok ? state.url : initialUrl;

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(id);
  }, [copied]);

  return (
    <div className="rounded-xl border border-gray-200 p-5 text-sm">
      <h2 className="font-semibold">{tk.shareTitle}</h2>
      <p className="mt-1 text-xs text-gray-500">{tk.shareHint}</p>

      {url ? (
        <div className="mt-3 space-y-2">
          <p className="break-all rounded-md bg-gray-50 p-2 font-mono text-xs text-gray-700">
            {url}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(url).then(
                  () => setCopied(true),
                  () => undefined,
                );
              }}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
            >
              {copied ? tk.shareCopied : tk.shareCopy}
            </button>
            <form action={formAction}>
              <input
                type="hidden"
                name="reference"
                value={reference}
                readOnly
              />
              <button
                type="submit"
                disabled={pending}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50"
              >
                {tk.shareRefresh}
              </button>
            </form>
          </div>
        </div>
      ) : (
        <form action={formAction} className="mt-3">
          <input type="hidden" name="reference" value={reference} readOnly />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-gray-900 px-4 py-2 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {pending ? "…" : tk.shareReveal}
          </button>
        </form>
      )}

      {state?.ok === false ? (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
