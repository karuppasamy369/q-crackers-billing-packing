"use server";

import { revalidatePath } from "next/cache";
import {
  actionOk,
  actionFail,
  type ActionResult,
} from "@/server/http/action-result";
import {
  regenerateTrackingToken,
  revokeTrackingToken,
} from "@/server/services/tracking-service";
import { env } from "@/env";

function trackUrl(token: string): string {
  return `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/track/${token}`;
}

export async function regenerateTrackingLinkAction(
  _prev: ActionResult<{ url: string }> | null,
  fd: FormData,
): Promise<ActionResult<{ url: string }>> {
  const orderId = String(fd.get("orderId") ?? "");
  try {
    const { token } = await regenerateTrackingToken({ orderId });
    revalidatePath(`/app/orders/${orderId}`);
    return actionOk(
      { url: trackUrl(token) },
      "New tracking link generated. Older links no longer work.",
    );
  } catch (err) {
    return actionFail(err);
  }
}

export async function revokeTrackingLinkAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const orderId = String(fd.get("orderId") ?? "");
  try {
    await revokeTrackingToken({ orderId });
    revalidatePath(`/app/orders/${orderId}`);
    return actionOk(undefined, "Tracking link revoked.");
  } catch (err) {
    return actionFail(err);
  }
}
