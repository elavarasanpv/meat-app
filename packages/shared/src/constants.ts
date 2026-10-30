/** Weight tolerance: final packed weight may differ from ordered weight by this fraction. */
export const WEIGHT_TOLERANCE = 0.05;

/** Delivery pricing (also enforced in the create_order SQL function). */
export const DELIVERY_FEE = 20;
export const FREE_DELIVERY_ABOVE = 499;

/** Delivery windows offered each day, in IST hours [start, end). */
export const SLOT_WINDOWS: ReadonlyArray<readonly [number, number]> = [
  [7, 9],
  [12, 14],
  [17, 19],
];
/** A slot must start at least this long after "now" to be offered. */
export const SLOT_LEAD_MINUTES = 60;

/** Riders within this many km of the shop see a packed order's offer. */
export const RIDER_OFFER_RADIUS_KM = 5;
/** A rider may carry at most this many undelivered orders at once. */
export const RIDER_MAX_ACTIVE_ORDERS = 3;
/** A later stop may jump the queue only if the detour costs the earlier customer less than this. */
export const ON_THE_WAY_DETOUR_KM = 1.5;

/** Minutes a dealer has to accept before the order is flagged for reassignment. */
export const DEALER_ACCEPT_TIMEOUT_MIN = 5;

/** Display order id, e.g. MT-1019-0042 (prefix-MMDD-dailySeq). */
export function formatDisplayOrderId(date: Date, dailySeq: number): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `MT-${mm}${dd}-${String(dailySeq).padStart(4, "0")}`;
}

export const ROLES = ["customer", "dealer", "rider", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const PAYMENT_MODES = ["cod", "upi_on_delivery", "prepaid_upi"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];
