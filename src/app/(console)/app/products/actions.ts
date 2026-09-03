"use server";

import { revalidatePath } from "next/cache";
import {
  actionOk,
  actionFail,
  type ActionResult,
} from "@/server/http/action-result";
import {
  createProduct,
  updateProduct,
  updateProductPrice,
  setProductVisibility,
  deleteProduct,
  addProductImage,
  removeProductImage,
  setPrimaryImage,
} from "@/server/services/products-service";

function str(fd: FormData, key: string): string | undefined {
  const v = fd.get(key);
  return typeof v === "string" && v !== "" ? v : undefined;
}

export async function createProductAction(
  _prev: ActionResult<{ id: string }> | null,
  fd: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const product = await createProduct({
      sku: str(fd, "sku"),
      name: str(fd, "name"),
      slug: str(fd, "slug"),
      categoryId: str(fd, "categoryId"),
      description: str(fd, "description"),
      priceRupees: str(fd, "priceRupees"),
      mrpRupees: str(fd, "mrpRupees"),
      hsnCode: str(fd, "hsnCode"),
      gstRateBp: str(fd, "gstRateBp"),
      weightGrams: str(fd, "weightGrams"),
      isActive: fd.get("isActive") !== null,
      isVisibleOnline: false,
      sortOrder: str(fd, "sortOrder") ?? 0,
    });
    revalidatePath("/app/products");
    return actionOk({ id: product.id }, `Product ${product.sku} created.`);
  } catch (err) {
    return actionFail(err);
  }
}

export async function updateProductDetailsAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  try {
    await updateProduct({
      id: str(fd, "id"),
      sku: str(fd, "sku"),
      name: str(fd, "name"),
      slug: str(fd, "slug"),
      categoryId: str(fd, "categoryId"),
      description:
        fd.get("description") === null
          ? undefined
          : String(fd.get("description")),
      hsnCode:
        fd.get("hsnCode") === null ? undefined : String(fd.get("hsnCode")),
      gstRateBp: str(fd, "gstRateBp"),
      weightGrams: str(fd, "weightGrams"),
      sortOrder: str(fd, "sortOrder"),
    });
    revalidatePath(`/app/products/${str(fd, "id")}`);
    revalidatePath("/app/products");
    return actionOk(undefined, "Product details saved.");
  } catch (err) {
    return actionFail(err);
  }
}

export async function updateProductPriceAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  try {
    await updateProductPrice({
      id: str(fd, "id"),
      priceRupees: str(fd, "priceRupees"),
      mrpRupees: str(fd, "mrpRupees"),
    });
    revalidatePath(`/app/products/${str(fd, "id")}`);
    revalidatePath("/app/products");
    return actionOk(undefined, "Price updated.");
  } catch (err) {
    return actionFail(err);
  }
}

export async function setVisibilityAction(
  id: string,
  isActive: boolean,
  isVisibleOnline: boolean,
): Promise<ActionResult> {
  try {
    await setProductVisibility({ id, isActive, isVisibleOnline });
    revalidatePath(`/app/products/${id}`);
    revalidatePath("/app/products");
    return actionOk(undefined, "Visibility updated.");
  } catch (err) {
    return actionFail(err);
  }
}

export async function deleteProductAction(id: string): Promise<ActionResult> {
  try {
    await deleteProduct({ id });
    revalidatePath("/app/products");
    return actionOk(undefined, "Product deleted.");
  } catch (err) {
    return actionFail(err);
  }
}

export async function addProductImageAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  try {
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Choose an image file." };
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    await addProductImage(
      { productId: str(fd, "productId"), altText: str(fd, "altText") },
      bytes,
    );
    revalidatePath(`/app/products/${str(fd, "productId")}`);
    return actionOk(undefined, "Image added.");
  } catch (err) {
    return actionFail(err);
  }
}

export async function removeProductImageAction(
  productId: string,
  imageId: string,
): Promise<ActionResult> {
  try {
    await removeProductImage({ productId, imageId });
    revalidatePath(`/app/products/${productId}`);
    return actionOk(undefined, "Image removed.");
  } catch (err) {
    return actionFail(err);
  }
}

export async function setPrimaryImageAction(
  productId: string,
  imageId: string,
): Promise<ActionResult> {
  try {
    await setPrimaryImage({ productId, imageId });
    revalidatePath(`/app/products/${productId}`);
    return actionOk(undefined, "Primary image set.");
  } catch (err) {
    return actionFail(err);
  }
}
