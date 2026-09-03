"use server";

import { revalidatePath } from "next/cache";
import {
  actionOk,
  actionFail,
  type ActionResult,
} from "@/server/http/action-result";
import {
  createCategory,
  updateCategory,
  deleteCategory,
} from "@/server/services/categories-service";

function formValue(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v : undefined;
}

export async function createCategoryAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  try {
    const cat = await createCategory({
      name: formValue(fd, "name"),
      slug: formValue(fd, "slug"),
      description: formValue(fd, "description"),
      sortOrder: formValue(fd, "sortOrder") ?? 0,
      isActive: fd.get("isActive") !== null,
    });
    revalidatePath("/app/categories");
    return actionOk(undefined, `Category "${cat.name}" created.`);
  } catch (err) {
    return actionFail(err);
  }
}

export async function updateCategoryAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  try {
    await updateCategory({
      id: formValue(fd, "id"),
      name: formValue(fd, "name"),
      slug: formValue(fd, "slug"),
      description: formValue(fd, "description") ?? "",
      sortOrder: formValue(fd, "sortOrder") ?? 0,
      isActive: fd.get("isActive") !== null,
    });
    revalidatePath("/app/categories");
    revalidatePath(`/app/categories/${formValue(fd, "id")}`);
    return actionOk(undefined, "Category updated.");
  } catch (err) {
    return actionFail(err);
  }
}

export async function deleteCategoryAction(id: string): Promise<ActionResult> {
  try {
    await deleteCategory({ id });
    revalidatePath("/app/categories");
    return actionOk(undefined, "Category deleted.");
  } catch (err) {
    return actionFail(err);
  }
}
