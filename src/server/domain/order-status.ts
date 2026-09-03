import type { OrderStatus } from "@/generated/prisma";

/**
 * Order state machine — skeleton.
 *
 * Phase 3 only ever creates orders in `AWAITING_PAYMENT`. The real transition
 * table (with guards: payment verified, courier/LR details present, etc.) and
 * the authorised partner override land in Phases 5–6. This module exists now so
 * those phases extend one place, and so the initial state has a single source.
 */
export const INITIAL_ORDER_STATUS: OrderStatus = "AWAITING_PAYMENT";

const ALLOWED: Record<OrderStatus, OrderStatus[]> = {
  AWAITING_PAYMENT: ["PAID", "PAYMENT_FAILED", "CANCELLED"],
  PAYMENT_FAILED: ["AWAITING_PAYMENT", "CANCELLED"],
  PAID: ["PACKED", "CANCELLED", "REFUNDED"],
  PACKED: ["PARCEL_BOOKED", "PAID", "CANCELLED"],
  PARCEL_BOOKED: ["COMPLETED", "PACKED"],
  COMPLETED: [],
  CANCELLED: [],
  REFUNDED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}
