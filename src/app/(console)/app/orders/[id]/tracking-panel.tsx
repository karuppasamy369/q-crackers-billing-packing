"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  regenerateTrackingLinkAction,
  revokeTrackingLinkAction,
} from "./tracking-actions";
import type { ActionResult } from "@/server/http/action-result";
import type { TrackingAdminInfo } from "@/server/services/tracking-service";

export function TrackingPanel({
  orderId,
  info,
  canManage,
}: {
  orderId: string;
  info: TrackingAdminInfo;
  canManage: boolean;
}) {
  const router = useRouter();
  const [gen, genAction, genPending] = useActionState<
    ActionResult<{ url: string }> | null,
    FormData
  >(regenerateTrackingLinkAction, null);
  const [rev, revAction, revPending] = useActionState<
    ActionResult | null,
    FormData
  >(revokeTrackingLinkAction, null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (rev?.ok) router.refresh();
  }, [rev, router]);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(id);
  }, [copied]);

  const statusText =
    info.status === "active"
      ? `Active${info.rotatedAt ? " · last regenerated " + new Date(info.rotatedAt).toLocaleDateString() : info.createdAt ? " since " + new Date(info.createdAt).toLocaleDateString() : ""}`
      : info.status === "revoked"
        ? `Revoked ${info.revokedAt ? new Date(info.revokedAt).toLocaleDateString() : ""}`
        : "Not generated yet";

  return (
    <div className="space-y-3 text-sm">
      <p className="text-gray-600">
        Status: <span className="font-medium">{statusText}</span>
      </p>

      {!info.eligible ? (
        <p className="text-xs text-gray-500">
          A tracking link becomes available once the order is paid.
        </p>
      ) : !canManage ? (
        <p className="text-xs text-gray-500">
          You do not have permission to manage tracking links.
        </p>
      ) : (
        <>
          <p className="text-xs text-gray-500">
            For security the link is shown only once. Generate a link to copy
            and send it — this replaces any previous link.
          </p>

          {gen?.ok && gen.data ? (
            <div className="space-y-2">
              <p className="break-all rounded-md bg-gray-50 p-2 font-mono text-xs text-gray-700">
                {gen.data.url}
              </p>
              <button
                type="button"
                onClick={() =>
                  navigator.clipboard?.writeText(gen.data!.url).then(
                    () => setCopied(true),
                    () => undefined,
                  )
                }
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
              >
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <form action={genAction}>
              <input type="hidden" name="orderId" value={orderId} readOnly />
              <button
                type="submit"
                disabled={genPending}
                className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {genPending
                  ? "Working…"
                  : info.status === "active"
                    ? "Regenerate link"
                    : "Generate link"}
              </button>
            </form>
            {info.status === "active" ? (
              <form action={revAction}>
                <input type="hidden" name="orderId" value={orderId} readOnly />
                <button
                  type="submit"
                  disabled={revPending}
                  className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  {revPending ? "Working…" : "Revoke link"}
                </button>
              </form>
            ) : null}
          </div>

          {gen?.ok === false ? (
            <p className="text-xs text-red-700">{gen.error}</p>
          ) : null}
          {rev?.ok === false ? (
            <p className="text-xs text-red-700">{rev.error}</p>
          ) : null}
          {rev?.ok ? (
            <p className="text-xs text-green-700">{rev.message}</p>
          ) : null}
        </>
      )}
    </div>
  );
}
