"use server";

import { revalidatePath } from "next/cache";
import {
  actionOk,
  actionFail,
  type ActionResult,
} from "@/server/http/action-result";
import { verifyPayment } from "@/server/services/payments-service";

export async function verifyPaymentAction(
  _prev: ActionResult<{ id: string }> | null,
  fd: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const isReject = fd.get("action") === "reject";
    const payment = await verifyPayment({
      paymentId: fd.get("paymentId"),
      action: fd.get("action"),
      upiReference: fd.get("upiReference") || undefined,
      note: fd.get("note") || undefined,
    });
    revalidatePath("/app/payments");
    revalidatePath(`/app/payments/${payment.id}`);
    revalidatePath("/app/billing");
    return actionOk(
      { id: payment.id },
      isReject
        ? "Payment rejected and the stock hold released."
        : "Payment verified. The order is paid and its bill has been issued.",
    );
  } catch (err) {
    return actionFail(err);
  }
}
