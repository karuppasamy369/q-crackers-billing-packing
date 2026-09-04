"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import {
  markPackedAction,
  confirmParcelBookedAction,
  updateBookingAction,
  uploadLrAction,
} from "./actions";
import type { ActionResult } from "@/server/http/action-result";

const field =
  "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900";

function Status({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return state.ok ? (
    <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
      {state.message}
    </p>
  ) : (
    <p
      role="alert"
      className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {state.error}
    </p>
  );
}

export function MarkPackedForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<
    ActionResult | null,
    FormData
  >(markPackedAction, null);
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} readOnly />
      <p className="text-sm text-gray-600">
        Confirm the items are packed and ready to hand to a courier.
      </p>
      <Status state={state} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {pending ? "Working…" : "Mark as packed"}
      </button>
    </form>
  );
}

type ParcelDefaults = {
  courierName: string;
  lrNumber: string;
  bookingDate: string;
  parcelCount: string;
  remarks: string;
};

export function ParcelBookingForm({
  orderId,
  mode,
  defaults,
}: {
  orderId: string;
  mode: "confirm" | "edit";
  defaults: ParcelDefaults;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<
    ActionResult | null,
    FormData
  >(mode === "confirm" ? confirmParcelBookedAction : updateBookingAction, null);
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} readOnly />

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="courierName" className="text-sm font-medium">
            Courier / transport name
          </label>
          <input
            id="courierName"
            name="courierName"
            required
            defaultValue={defaults.courierName}
            className={field}
          />
        </div>
        <div>
          <label htmlFor="lrNumber" className="text-sm font-medium">
            LR / parcel number
          </label>
          <input
            id="lrNumber"
            name="lrNumber"
            required
            autoComplete="off"
            defaultValue={defaults.lrNumber}
            className={field}
          />
        </div>
        <div>
          <label htmlFor="bookingDate" className="text-sm font-medium">
            Booking date
          </label>
          <input
            id="bookingDate"
            name="bookingDate"
            type="date"
            required
            defaultValue={defaults.bookingDate}
            className={field}
          />
        </div>
        <div>
          <label htmlFor="parcelCount" className="text-sm font-medium">
            Number of parcels
          </label>
          <input
            id="parcelCount"
            name="parcelCount"
            type="number"
            min={1}
            max={999}
            required
            defaultValue={defaults.parcelCount}
            className={field}
          />
        </div>
      </div>

      <div>
        <label htmlFor="remarks" className="text-sm font-medium">
          Remarks (optional)
        </label>
        <textarea
          id="remarks"
          name="remarks"
          rows={2}
          defaultValue={defaults.remarks}
          className={field}
        />
      </div>

      <Status state={state} />

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {pending
          ? "Working…"
          : mode === "confirm"
            ? "Confirm parcel booked"
            : "Save booking details"}
      </button>
    </form>
  );
}

export function LrUploadForm({
  orderId,
  hasCurrent,
}: {
  orderId: string;
  hasCurrent: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState<
    ActionResult | null,
    FormData
  >(uploadLrAction, null);
  useEffect(() => {
    if (state?.ok) {
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="orderId" value={orderId} readOnly />
      <input
        ref={inputRef}
        type="file"
        name="lr"
        accept="application/pdf"
        required
        className="block w-full text-sm"
      />
      <p className="text-xs text-gray-500">
        PDF only. Re-uploading replaces the current copy (the previous file is
        kept in the history).
      </p>
      <Status state={state} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
      >
        {pending
          ? "Uploading…"
          : hasCurrent
            ? "Replace LR PDF"
            : "Upload LR PDF"}
      </button>
    </form>
  );
}
