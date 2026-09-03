"use server";

import { revalidatePath } from "next/cache";
import {
  actionOk,
  actionFail,
  type ActionResult,
} from "@/server/http/action-result";
import {
  adjustStock,
  setReorderLevel,
} from "@/server/services/inventory-service";

function str(fd: FormData, k: string) {
  const v = fd.get(k);
  return typeof v === "string" ? v : undefined;
}

export async function adjustStockAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  try {
    const res = await adjustStock({
      productId: str(fd, "productId"),
      mode: str(fd, "mode"),
      quantity: str(fd, "quantity"),
      reason: str(fd, "reason"),
      note: str(fd, "note"),
    });
    revalidatePath(`/app/inventory/${str(fd, "productId")}`);
    revalidatePath("/app/inventory");
    revalidatePath(`/app/products/${str(fd, "productId")}`);
    return actionOk(undefined, `Stock updated: ${res.from} → ${res.to}.`);
  } catch (err) {
    return actionFail(err);
  }
}

export async function setReorderLevelAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  try {
    await setReorderLevel({
      productId: str(fd, "productId"),
      reorderLevel: str(fd, "reorderLevel"),
    });
    revalidatePath(`/app/inventory/${str(fd, "productId")}`);
    revalidatePath("/app/inventory");
    return actionOk(undefined, "Reorder level saved.");
  } catch (err) {
    return actionFail(err);
  }
}
