/** Weight tolerance: final packed weight may differ from ordered weight by this fraction. */
export const WEIGHT_TOLERANCE = 0.05;

/** Delivery pricing (also enforced in the create_order SQL function). */
// Delivery fees live in delivery_fee_rules (admin > Delivery). These two only
// cover orders placed before the fee was saved on the order.
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
/** A meat order whose slot starts later than this is "for later": the shop accepts it for the slot, with no ready-in minutes. */
export const SCHEDULED_AFTER_MIN = 120;
/** A for-later order is prepared this long before its slot starts; the shop is reminded then. */
export const PREP_LEAD_MIN = 60;

/**
 * A shop serves an address when the pincode is on its service list or its pin
 * is within this many km. Same number as shop_region_km() in the database.
 */
export const SHOP_REGION_KM = 5;
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

/**
 * Backdrops a grocery product photo can sit on (card and item page). All are
 * near-white so a packet never melts into them; the admin picks the one that
 * suits the photo. Colours run top → bottom.
 */
export const CARD_BACKGROUNDS = ["white", "green", "grey", "cream"] as const;
export type CardBackground = (typeof CARD_BACKGROUNDS)[number];
export const CARD_BG: Record<CardBackground, { label: string; light: readonly [string, string]; dark: readonly [string, string]; border: string; borderDark: string }> = {
  white: { label: "White", light: ["#FFFFFF", "#FFFFFF"], dark: ["#231E1C", "#231E1C"], border: "#E9E5E1", borderDark: "#352F2C" },
  green: { label: "Light green", light: ["#FFFFFF", "#EAF5EE"], dark: ["#1F1A18", "#1B2B21"], border: "#DCEBE0", borderDark: "#2A3A30" },
  grey: { label: "Light grey", light: ["#FFFFFF", "#ECEEF1"], dark: ["#1F1A18", "#2B2C30"], border: "#E2E4E8", borderDark: "#3A3B40" },
  cream: { label: "Cream", light: ["#FFFFFF", "#FAF0E1"], dark: ["#1F1A18", "#30271D"], border: "#EFE3D0", borderDark: "#42372A" },
};
