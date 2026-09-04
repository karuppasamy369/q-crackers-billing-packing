"use server";

import { revalidatePath } from "next/cache";
import {
  actionOk,
  actionFail,
  type ActionResult,
} from "@/server/http/action-result";
import {
  markOrderPacked,
  confirmParcelBooked,
  updateBookingDetails,
  uploadLrDocument,
  markOrderCompleted,
} from "@/server/services/booking-service";

function revalidateBooking(orderId: string) {
  revalidatePath("/app/booking");
  revalidatePath(`/app/booking/${orderId}`);
  revalidatePath(`/app/orders/${orderId}`);
}

export async function markPackedAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const orderId = String(fd.get("orderId") ?? "");
  try {
    await markOrderPacked({ orderId });
    revalidateBooking(orderId);
    return actionOk(undefined, "Order marked as packed.");
  } catch (err) {
    return actionFail(err);
  }
}

function parcelFields(fd: FormData) {
  return {
    orderId: String(fd.get("orderId") ?? ""),
    courierName: String(fd.get("courierName") ?? ""),
    lrNumber: String(fd.get("lrNumber") ?? ""),
    bookingDate: String(fd.get("bookingDate") ?? ""),
    parcelCount: String(fd.get("parcelCount") ?? ""),
    remarks: String(fd.get("remarks") ?? ""),
  };
}

export async function confirmParcelBookedAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const input = parcelFields(fd);
  try {
    await confirmParcelBooked(input);
    revalidateBooking(input.orderId);
    return actionOk(
      undefined,
      "Parcel booked. The order is now PARCEL_BOOKED.",
    );
  } catch (err) {
    return actionFail(err);
  }
}

export async function updateBookingAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const input = parcelFields(fd);
  try {
    await updateBookingDetails(input);
    revalidateBooking(input.orderId);
    return actionOk(undefined, "Booking details updated.");
  } catch (err) {
    return actionFail(err);
  }
}

export async function markCompletedAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const orderId = String(fd.get("orderId") ?? "");
  try {
    await markOrderCompleted({ orderId });
    revalidateBooking(orderId);
    return actionOk(undefined, "Order marked as completed.");
  } catch (err) {
    return actionFail(err);
  }
}

export async function uploadLrAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const orderId = String(fd.get("orderId") ?? "");
  try {
    const file = fd.get("lr");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Choose a PDF file to upload." };
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    await uploadLrDocument({ orderId }, bytes, file.name);
    revalidateBooking(orderId);
    return actionOk(undefined, "LR document uploaded.");
  } catch (err) {
    return actionFail(err);
  }
}
