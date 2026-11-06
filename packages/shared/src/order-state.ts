/**
 * Order lifecycle state machine.
 * The API is the only writer of orders.status; it must validate every
 * change with `canTransition` and record it in order_status_history.
 */
export const ORDER_STATUSES = [
  "PLACED",
  "DEALER_ASSIGNED",
  "ACCEPTED",
  "PACKING",
  "PACKED",
  "RIDER_ASSIGNED",
  "PICKED_UP",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
  "DELIVERY_FAILED",
  "RETURNED",
  "REFUNDED",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PLACED: ["DEALER_ASSIGNED", "CANCELLED"],
  DEALER_ASSIGNED: ["ACCEPTED", "DEALER_ASSIGNED", "CANCELLED"], // re-assign allowed
  ACCEPTED: ["PACKING", "CANCELLED"],
  PACKING: ["PACKED", "CANCELLED"],
  PACKED: ["RIDER_ASSIGNED", "CANCELLED"], // admin may cancel before a rider takes it
  RIDER_ASSIGNED: ["PICKED_UP", "RIDER_ASSIGNED", "PACKED"], // re-assign allowed; admin release → back to PACKED
  PICKED_UP: ["OUT_FOR_DELIVERY"],
  OUT_FOR_DELIVERY: ["DELIVERED", "DELIVERY_FAILED"],
  DELIVERED: ["REFUNDED"],
  DELIVERY_FAILED: ["OUT_FOR_DELIVERY", "RETURNED"],
  RETURNED: ["REFUNDED"],
  CANCELLED: ["REFUNDED"],
  REFUNDED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Statuses in which the customer may still cancel without admin help (until the shop accepts). */
export const CUSTOMER_CANCELLABLE: OrderStatus[] = ["PLACED", "DEALER_ASSIGNED"];

/** Reasons offered in the app when cancelling; stored as-is on orders.cancel_reason. */
export const CANCEL_REASONS = ["mistake", "change_items", "too_long", "other"] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];

/** Guard data each transition requires before it is allowed. */
export const TRANSITION_REQUIREMENTS: Partial<Record<OrderStatus, string[]>> = {
  PACKED: ["label_code", "packed_photo", "actual_weight_kg"],
  PICKED_UP: ["label_scan_match"],
  DELIVERED: ["customer_otp", "handover_photo", "payment_captured"],
};

/** Hours after an order closes (delivered, cancelled, returned) that the customer can still raise help on it. */
export const SUPPORT_WINDOW_HOURS = 24;
const CLOSED_STATUSES: OrderStatus[] = ["DELIVERED", "CANCELLED", "RETURNED", "REFUNDED"];

/**
 * When help on this order stops: SUPPORT_WINDOW_HOURS after it first closed.
 * null = still open-ended (order in progress, or no close time recorded).
 */
export function supportClosesAt(status: string, history: { to_status: string; created_at: string }[]): Date | null {
  if (!CLOSED_STATUSES.includes(status as OrderStatus)) return null;
  const times = history.filter((h) => CLOSED_STATUSES.includes(h.to_status as OrderStatus)).map((h) => Date.parse(h.created_at));
  if (!times.length) return null;
  return new Date(Math.min(...times) + SUPPORT_WINDOW_HOURS * 3_600_000);
}
