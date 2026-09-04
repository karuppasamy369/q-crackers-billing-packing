"use server";

import { revalidatePath } from "next/cache";
import {
  actionOk,
  actionFail,
  type ActionResult,
} from "@/server/http/action-result";
import {
  retryNotification,
  requestReviewNotification,
} from "@/server/services/notifications-service";

export async function retryNotificationAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  try {
    await retryNotification({ id: fd.get("id") });
    revalidatePath("/app/notifications");
    return actionOk(undefined, "Notification re-queued for delivery.");
  } catch (err) {
    return actionFail(err);
  }
}

export async function requestReviewAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const orderId = String(fd.get("orderId") ?? "");
  try {
    const result = await requestReviewNotification({ orderId });
    revalidatePath(`/app/orders/${orderId}`);
    revalidatePath("/app/notifications");
    return actionOk(
      undefined,
      result === "duplicate"
        ? "A review request has already been queued for this order."
        : result === "skipped"
          ? "Queued, but this customer has no valid mobile number."
          : "Review request queued.",
    );
  } catch (err) {
    return actionFail(err);
  }
}
