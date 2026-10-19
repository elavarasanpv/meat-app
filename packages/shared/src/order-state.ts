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
  PACKED: ["RIDER_ASSIGNED"],
  RIDER_ASSIGNED: ["PICKED_UP", "RIDER_ASSIGNED"], // re-assign allowed
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

/** Statuses in which the customer may still cancel without admin help. */
export const CUSTOMER_CANCELLABLE: OrderStatus[] = [
  "PLACED",
  "DEALER_ASSIGNED",
  "ACCEPTED",
];

/** Guard data each transition requires before it is allowed. */
export const TRANSITION_REQUIREMENTS: Partial<Record<OrderStatus, string[]>> = {
  PACKED: ["label_code", "packed_photo", "actual_weight_kg"],
  PICKED_UP: ["label_scan_match"],
  DELIVERED: ["customer_otp", "handover_photo", "payment_captured"],
};
