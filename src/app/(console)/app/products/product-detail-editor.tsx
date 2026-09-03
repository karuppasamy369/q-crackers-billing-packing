"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateProductDetailsAction,
  updateProductPriceAction,
  setVisibilityAction,
  deleteProductAction,
} from "./actions";
import {
  Field,
  SubmitButton,
  FormNotice,
  fieldClass,
} from "@/components/console/form";
import { Card } from "@/components/console/ui";
import type { ActionResult } from "@/server/http/action-result";
import { paiseToRupeesString } from "@/lib/money";

type Product = {
  id: string;
  sku: string;
  name: string;
  slug: string;
  categoryId: string;
  description: string | null;
  pricePaise: number;
  mrpPaise: number | null;
  hsnCode: string | null;
  gstRateBp: number;
  weightGrams: number | null;
  sortOrder: number;
  isActive: boolean;
  isVisibleOnline: boolean;
  imageCount: number;
};

export function ProductDetailEditor({
  product,
  categories,
  canManage,
  canPrice,
}: {
  product: Product;
  categories: { id: string; name: string }[];
  canManage: boolean;
  canPrice: boolean;
}) {
  const [details, detailsAction] = useActionState<
    ActionResult | null,
    FormData
  >(updateProductDetailsAction, null);
  const [price, priceAction] = useActionState<ActionResult | null, FormData>(
    updateProductPriceAction,
    null,
  );
  const router = useRouter();
  const [pending, start] = useTransition();
  const [visMsg, setVisMsg] = useState<string | null>(null);

  useEffect(() => {
    if (details?.ok || price?.ok) router.refresh();
  }, [details, price, router]);

  const setVisibility = (isActive: boolean, isVisibleOnline: boolean) =>
    start(async () => {
      const r = await setVisibilityAction(
        product.id,
        isActive,
        isVisibleOnline,
      );
      setVisMsg(r.ok ? null : r.error);
      if (r.ok) router.refresh();
    });

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="mb-3 text-sm font-semibold">Storefront visibility</h2>
        <p className="text-sm text-gray-600">
          {product.isVisibleOnline
            ? "Live on the storefront."
            : product.isActive
              ? "Active internally, hidden from the storefront."
              : "Inactive."}
        </p>
        {canManage ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              disabled={pending || !product.isActive}
              onClick={() => setVisibility(true, !product.isVisibleOnline)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {product.isVisibleOnline
                ? "Hide from storefront"
                : "Publish to storefront"}
            </button>
            <button
              disabled={pending}
              onClick={() => setVisibility(!product.isActive, false)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {product.isActive ? "Mark inactive" : "Mark active"}
            </button>
          </div>
        ) : null}
        {product.imageCount === 0 ? (
          <p className="mt-2 text-xs text-amber-700">
            Add at least one image before publishing.
          </p>
        ) : null}
        {visMsg ? <p className="mt-2 text-sm text-red-700">{visMsg}</p> : null}
      </Card>

      {canPrice ? (
        <Card>
          <h2 className="mb-3 text-sm font-semibold">Price</h2>
          <form action={priceAction} className="space-y-3">
            <input type="hidden" name="id" value={product.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Selling price (₹)" name="priceRupees">
                <input
                  id="priceRupees"
                  name="priceRupees"
                  inputMode="decimal"
                  required
                  defaultValue={paiseToRupeesString(product.pricePaise)}
                  className={fieldClass}
                />
              </Field>
              <Field label="MRP (₹, optional)" name="mrpRupees">
                <input
                  id="mrpRupees"
                  name="mrpRupees"
                  inputMode="decimal"
                  defaultValue={
                    product.mrpPaise != null
                      ? paiseToRupeesString(product.mrpPaise)
                      : ""
                  }
                  className={fieldClass}
                />
              </Field>
            </div>
            <FormNotice state={price} />
            <SubmitButton>Update price</SubmitButton>
          </form>
        </Card>
      ) : (
        <Card>
          <h2 className="text-sm font-semibold">Price</h2>
          <p className="mt-1 text-sm text-gray-500">
            Current price is set. You do not have permission to change prices.
          </p>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 text-sm font-semibold">Details</h2>
        {canManage ? (
          <form action={detailsAction} className="space-y-3">
            <input type="hidden" name="id" value={product.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="SKU" name="sku">
                <input
                  id="sku"
                  name="sku"
                  defaultValue={product.sku}
                  className={fieldClass}
                />
              </Field>
              <Field label="Category" name="categoryId">
                <select
                  id="categoryId"
                  name="categoryId"
                  defaultValue={product.categoryId}
                  className={fieldClass}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Name" name="name">
              <input
                id="name"
                name="name"
                defaultValue={product.name}
                className={fieldClass}
              />
            </Field>
            <Field label="Slug" name="slug">
              <input
                id="slug"
                name="slug"
                defaultValue={product.slug}
                className={fieldClass}
              />
            </Field>
            <Field label="Description" name="description">
              <textarea
                id="description"
                name="description"
                rows={3}
                defaultValue={product.description ?? ""}
                className={fieldClass}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="GST rate (bp)" name="gstRateBp">
                <input
                  id="gstRateBp"
                  name="gstRateBp"
                  type="number"
                  min={0}
                  max={5000}
                  defaultValue={product.gstRateBp}
                  className={fieldClass}
                />
              </Field>
              <Field label="HSN code" name="hsnCode">
                <input
                  id="hsnCode"
                  name="hsnCode"
                  defaultValue={product.hsnCode ?? ""}
                  className={fieldClass}
                />
              </Field>
              <Field label="Weight (g)" name="weightGrams">
                <input
                  id="weightGrams"
                  name="weightGrams"
                  type="number"
                  min={0}
                  defaultValue={product.weightGrams ?? ""}
                  className={fieldClass}
                />
              </Field>
            </div>
            <Field label="Sort order" name="sortOrder">
              <input
                id="sortOrder"
                name="sortOrder"
                type="number"
                min={0}
                defaultValue={product.sortOrder}
                className={fieldClass}
              />
            </Field>
            <FormNotice state={details} />
            <SubmitButton>Save details</SubmitButton>
          </form>
        ) : (
          <dl className="grid grid-cols-3 gap-2 text-sm">
            <dt className="text-gray-500">SKU</dt>
            <dd className="col-span-2 font-mono">{product.sku}</dd>
            <dt className="text-gray-500">Name</dt>
            <dd className="col-span-2">{product.name}</dd>
          </dl>
        )}
      </Card>

      {canManage ? (
        <Card className="border-red-200">
          <h2 className="text-sm font-semibold text-red-800">Delete</h2>
          <p className="mt-1 text-sm text-gray-600">
            Only possible if the product has no stock history. Otherwise mark it
            inactive.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={async () => {
              if (!confirm(`Delete ${product.sku}?`)) return;
              const r = await deleteProductAction(product.id);
              if (r.ok) {
                router.push("/app/products");
                router.refresh();
              } else {
                setVisMsg(r.error);
              }
            }}
            className="mt-3 rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
          >
            Delete product
          </button>
        </Card>
      ) : null}
    </div>
  );
}
