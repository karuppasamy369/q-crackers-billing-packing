"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createCounterBillAction } from "./actions";
import {
  Field,
  SubmitButton,
  FormNotice,
  fieldClass,
} from "@/components/console/form";
import type { ActionResult } from "@/server/http/action-result";
import { formatPaise } from "@/lib/money";
import { GST_STATE_CODES } from "@/lib/india";

export type PickableProduct = {
  id: string;
  sku: string;
  name: string;
  pricePaise: number;
  available: number;
};

type Line = { productId: string; quantity: number };

const STATE_OPTIONS = Object.entries(GST_STATE_CODES).sort((a, b) =>
  a[1].localeCompare(b[1]),
);

export function CounterBillForm({
  products,
  pricesIncludeGst,
}: {
  products: PickableProduct[];
  pricesIncludeGst: boolean;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>([]);
  const [pickId, setPickId] = useState("");
  const byId = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  const [state, formAction] = useActionState<
    ActionResult<{ id: string }> | null,
    FormData
  >(createCounterBillAction, null);

  useEffect(() => {
    if (state?.ok && state.data?.id) {
      router.push(`/app/billing/${state.data.id}`);
    }
  }, [state, router]);

  const addLine = () => {
    if (!pickId) return;
    setLines((cur) =>
      cur.some((l) => l.productId === pickId)
        ? cur
        : [...cur, { productId: pickId, quantity: 1 }],
    );
    setPickId("");
  };

  const total = lines.reduce((sum, l) => {
    const p = byId.get(l.productId);
    return sum + (p ? p.pricePaise * l.quantity : 0);
  }, 0);

  return (
    <form action={formAction} className="space-y-6">
      <input
        type="hidden"
        name="items"
        value={JSON.stringify(lines)}
        readOnly
      />

      <div className="rounded-xl border border-gray-200 p-5">
        <h2 className="mb-3 text-sm font-semibold">Items</h2>
        <div className="flex gap-2">
          <select
            value={pickId}
            onChange={(e) => setPickId(e.target.value)}
            className={fieldClass}
          >
            <option value="">Choose a product…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id} disabled={p.available <= 0}>
                {p.sku} — {p.name} · {formatPaise(p.pricePaise)} · stock{" "}
                {p.available}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={addLine}
            className="shrink-0 rounded-md border border-gray-300 px-3 text-sm hover:bg-gray-50"
          >
            Add
          </button>
        </div>

        {lines.length > 0 ? (
          <table className="mt-3 w-full text-sm">
            <tbody>
              {lines.map((l) => {
                const p = byId.get(l.productId);
                return (
                  <tr key={l.productId} className="border-b border-gray-100">
                    <td className="py-2">{p?.name ?? l.productId}</td>
                    <td className="py-2 text-gray-500">
                      {p ? formatPaise(p.pricePaise) : ""}
                    </td>
                    <td className="py-2">
                      <input
                        type="number"
                        min={1}
                        max={p?.available ?? 5000}
                        value={l.quantity}
                        onChange={(e) =>
                          setLines((cur) =>
                            cur.map((x) =>
                              x.productId === l.productId
                                ? {
                                    ...x,
                                    quantity: Math.max(
                                      1,
                                      Number(e.target.value) || 1,
                                    ),
                                  }
                                : x,
                            ),
                          )
                        }
                        className="w-16 rounded-md border border-gray-300 px-2 py-1"
                      />
                    </td>
                    <td className="py-2">
                      {p ? formatPaise(p.pricePaise * l.quantity) : ""}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          setLines((cur) =>
                            cur.filter((x) => x.productId !== l.productId),
                          )
                        }
                        className="text-xs text-red-600 underline"
                      >
                        remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="mt-3 text-sm text-gray-400">No items added.</p>
        )}

        <p className="mt-3 text-xs text-gray-500">
          Indicative total {formatPaise(total)} —{" "}
          {pricesIncludeGst ? "prices include GST" : "GST added at billing"}.
          The exact tax split is computed server-side.
        </p>
      </div>

      <div className="grid gap-4 rounded-xl border border-gray-200 p-5 sm:grid-cols-2">
        <Field label="Customer name" name="name">
          <input id="name" name="name" required className={fieldClass} />
        </Field>
        <Field label="Phone (optional)" name="phone">
          <input
            id="phone"
            name="phone"
            inputMode="tel"
            className={fieldClass}
          />
        </Field>
        <Field label="GSTIN (optional)" name="gstin">
          <input id="gstin" name="gstin" className={fieldClass} />
        </Field>
        <Field label="Customer state" name="stateCode">
          <select
            id="stateCode"
            name="stateCode"
            defaultValue="33"
            className={fieldClass}
          >
            {STATE_OPTIONS.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Address (optional)" name="address">
          <input id="address" name="address" className={fieldClass} />
        </Field>
        <Field label="Payment mode" name="paymentMode">
          <select
            id="paymentMode"
            name="paymentMode"
            defaultValue="CASH"
            className={fieldClass}
          >
            <option value="CASH">Cash</option>
            <option value="UPI">UPI</option>
            <option value="CARD">Card</option>
            <option value="BANK_TRANSFER">Bank transfer</option>
            <option value="OTHER">Other</option>
          </select>
        </Field>
      </div>

      <FormNotice state={state} />
      <SubmitButton>Create bill</SubmitButton>
    </form>
  );
}
