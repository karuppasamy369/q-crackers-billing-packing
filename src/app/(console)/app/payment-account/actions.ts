"use server";

import { revalidatePath } from "next/cache";
import {
  actionOk,
  actionFail,
  type ActionResult,
} from "@/server/http/action-result";
import {
  updateMyPaymentAccount,
  setMyStaticQr,
  removeMyStaticQr,
} from "@/server/services/payment-accounts-service";

export async function updatePaymentAccountAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  try {
    await updateMyPaymentAccount({
      upiVpa: fd.get("upiVpa") || "",
      payeeName: fd.get("payeeName") || "",
      instructions: fd.get("instructions") || "",
      isActive: fd.get("isActive") ?? "",
    });
    revalidatePath("/app/payment-account");
    return actionOk(undefined, "Payment details saved.");
  } catch (err) {
    return actionFail(err);
  }
}

export async function uploadStaticQrAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  try {
    const file = fd.get("qr");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Choose an image file to upload." };
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    await setMyStaticQr(bytes);
    revalidatePath("/app/payment-account");
    return actionOk(undefined, "Static QR uploaded.");
  } catch (err) {
    return actionFail(err);
  }
}

export async function removeStaticQrAction(
  _prev?: ActionResult | null,
  _fd?: FormData,
): Promise<ActionResult> {
  try {
    await removeMyStaticQr();
    revalidatePath("/app/payment-account");
    return actionOk(undefined, "Static QR removed.");
  } catch (err) {
    return actionFail(err);
  }
}
