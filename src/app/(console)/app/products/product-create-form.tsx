"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createProductAction } from "./actions";
import {
  Field,
  SubmitButton,
  FormNotice,
  fieldClass,
} from "@/components/console/form";
import type { ActionResult } from "@/server/http/action-result";

export function ProductCreateForm({
  categories,
  defaultGstRateBp,
}: {
  categories: { id: string; name: string }[];
  defaultGstRateBp: number;
}) {
  const [state, formAction] = useActionState<
    ActionResult<{ id: string }> | null,
    FormData
  >(createProductAction, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok && state.data?.id) {
      router.push(`/app/products/${state.data.id}`);
    }
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="SKU" name="sku">
          <input id="sku" name="sku" required className={fieldClass} />
        </Field>
        <Field label="Category" name="categoryId">
          <select
            id="categoryId"
            name="categoryId"
            required
            className={fieldClass}
          >
            <option value="">Select…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Name" name="name">
        <input id="name" name="name" required className={fieldClass} />
      </Field>

      <Field label="Slug" name="slug" help="Blank = generated from the name.">
        <input id="slug" name="slug" className={fieldClass} />
      </Field>

      <Field label="Description" name="description">
        <textarea
          id="description"
          name="description"
          rows={3}
          className={fieldClass}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Selling price (₹)" name="priceRupees">
          <input
            id="priceRupees"
            name="priceRupees"
            inputMode="decimal"
            required
            placeholder="199.00"
            className={fieldClass}
          />
        </Field>
        <Field label="MRP (₹, optional)" name="mrpRupees">
          <input
            id="mrpRupees"
            name="mrpRupees"
            inputMode="decimal"
            placeholder="249.00"
            className={fieldClass}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="GST rate (basis points)"
          name="gstRateBp"
          help="1800 = 18%"
        >
          <input
            id="gstRateBp"
            name="gstRateBp"
            type="number"
            min={0}
            max={5000}
            defaultValue={defaultGstRateBp}
            className={fieldClass}
          />
        </Field>
        <Field label="HSN code (optional)" name="hsnCode">
          <input id="hsnCode" name="hsnCode" className={fieldClass} />
        </Field>
        <Field label="Weight (grams, optional)" name="weightGrams">
          <input
            id="weightGrams"
            name="weightGrams"
            type="number"
            min={0}
            className={fieldClass}
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked />
        Active (sellable internally). Publish to the storefront after adding
        images.
      </label>

      <FormNotice state={state} />
      <SubmitButton>Create product</SubmitButton>
    </form>
  );
}
