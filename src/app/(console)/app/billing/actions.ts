"use server";

import { revalidatePath } from "next/cache";
import {
  actionOk,
  actionFail,
  type ActionResult,
} from "@/server/http/action-result";
import {
  createCounterBill,
  cancelBill,
  issueBillForOrder,
} from "@/server/services/billing-service";

type CartLine = { productId: string; quantity: number };

function parseLines(raw: FormDataEntryValue | null): CartLine[] {
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((e) => ({
        productId: String(e?.productId ?? ""),
        quantity: Number(e?.quantity ?? 0),
      }))
      .filter(
        (e) => e.productId && Number.isFinite(e.quantity) && e.quantity > 0,
      );
  } catch {
    return [];
  }
}

export async function createCounterBillAction(
  _prev: ActionResult<{ id: string }> | null,
  fd: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const bill = await createCounterBill({
      customer: {
        name: fd.get("name"),
        phone: fd.get("phone") || undefined,
        email: fd.get("email") || undefined,
        gstin: fd.get("gstin") || undefined,
        address: fd.get("address") || undefined,
        stateCode: fd.get("stateCode") || "33",
      },
      items: parseLines(fd.get("items")),
      paymentMode: fd.get("paymentMode"),
      notes: fd.get("notes") || undefined,
    });
    revalidatePath("/app/billing");
    return actionOk({ id: bill.id }, `Bill ${bill.billNumber} created.`);
  } catch (err) {
    return actionFail(err);
  }
}

export async function issueBillForOrderAction(
  orderId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const bill = await issueBillForOrder({ orderId });
    revalidatePath("/app/billing");
    return actionOk({ id: bill.id }, `Bill ${bill.billNumber} created.`);
  } catch (err) {
    return actionFail(err);
  }
}

export async function cancelBillAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  try {
    const bill = await cancelBill({
      id: fd.get("id"),
      reason: fd.get("reason"),
    });
    revalidatePath("/app/billing");
    revalidatePath(`/app/billing/${bill.id}`);
    return actionOk(undefined, "Bill cancelled.");
  } catch (err) {
    return actionFail(err);
  }
}
