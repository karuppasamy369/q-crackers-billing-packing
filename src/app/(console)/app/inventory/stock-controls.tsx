"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { adjustStockAction, setReorderLevelAction } from "./actions";
import {
  Field,
  SubmitButton,
  FormNotice,
  fieldClass,
} from "@/components/console/form";
import type { ActionResult } from "@/server/http/action-result";

export function StockControls({
  productId,
  reorderLevel,
}: {
  productId: string;
  reorderLevel: number;
}) {
  const router = useRouter();
  const [adjust, adjustAction] = useActionState<ActionResult | null, FormData>(
    adjustStockAction,
    null,
  );
  const [reorder, reorderAction] = useActionState<
    ActionResult | null,
    FormData
  >(setReorderLevelAction, null);

  useEffect(() => {
    if (adjust?.ok || reorder?.ok) router.refresh();
  }, [adjust, reorder, router]);

  return (
    <div className="space-y-6">
      <form action={adjustAction} className="space-y-3">
        <input type="hidden" name="productId" value={productId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Mode" name="mode">
            <select
              id="mode"
              name="mode"
              className={fieldClass}
              defaultValue="delta"
            >
              <option value="delta">Add / remove (delta)</option>
              <option value="set">Set exact count</option>
            </select>
          </Field>
          <Field
            label="Quantity"
            name="quantity"
            help="Delta: use a negative number to remove. Set: the new total."
          >
            <input
              id="quantity"
              name="quantity"
              type="number"
              required
              className={fieldClass}
            />
          </Field>
        </div>
        <Field label="Reason" name="reason">
          <select
            id="reason"
            name="reason"
            className={fieldClass}
            defaultValue="RESTOCK"
          >
            <option value="RESTOCK">Restock</option>
            <option value="ADJUSTMENT">Correction / adjustment</option>
          </select>
        </Field>
        <Field label="Note (optional)" name="note">
          <input id="note" name="note" className={fieldClass} />
        </Field>
        <FormNotice state={adjust} />
        <SubmitButton>Apply adjustment</SubmitButton>
      </form>

      <form
        action={reorderAction}
        className="space-y-2 border-t border-gray-100 pt-4"
      >
        <input type="hidden" name="productId" value={productId} />
        <Field
          label="Reorder level"
          name="reorderLevel"
          help="Flag the item as low when available stock reaches this. 0 = no alert."
        >
          <input
            id="reorderLevel"
            name="reorderLevel"
            type="number"
            min={0}
            defaultValue={reorderLevel}
            className={fieldClass}
          />
        </Field>
        <FormNotice state={reorder} />
        <SubmitButton variant="secondary">Save reorder level</SubmitButton>
      </form>
    </div>
  );
}
