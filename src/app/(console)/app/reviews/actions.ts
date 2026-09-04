"use server";

import { revalidatePath } from "next/cache";
import {
  actionOk,
  actionFail,
  type ActionResult,
} from "@/server/http/action-result";
import { moderateReview } from "@/server/services/reviews-service";

export async function moderateReviewAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  try {
    await moderateReview({
      id: fd.get("id"),
      action: fd.get("action"),
      note: fd.get("note") || undefined,
    });
    revalidatePath("/app/reviews");
    const action = String(fd.get("action"));
    return actionOk(
      undefined,
      action === "delete"
        ? "Review deleted."
        : action === "hide"
          ? "Review hidden."
          : "Review re-published.",
    );
  } catch (err) {
    return actionFail(err);
  }
}
