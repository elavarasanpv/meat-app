/**
 * App charge: what a shop gives Thanjoz Mart for each order (taken off the
 * shop's amount; the customer does not pay it).
 */
export type AppChargeMode = "none" | "percent" | "flat";
export type AppChargeRule = { mode: AppChargeMode; value: number };

export const NO_APP_CHARGE: AppChargeRule = { mode: "none", value: 0 };

/** The shop's own rule when it has one, else the default. */
export function effectiveAppCharge(
  shop: { app_charge_mode?: string | null; app_charge_value?: number | string | null } | null | undefined,
  fallback: AppChargeRule,
): AppChargeRule {
  if (shop?.app_charge_mode) return { mode: shop.app_charge_mode as AppChargeMode, value: Number(shop.app_charge_value ?? 0) };
  return fallback;
}

/**
 * The charge in whole rupees. A percentage is of the items at the customer
 * price (delivery not included). Never more than the shop's own amount.
 */
export function appChargeFor(rule: AppChargeRule, itemsTotal: number, shopTotal: number): number {
  const raw = rule.mode === "percent" ? (itemsTotal * rule.value) / 100 : rule.mode === "flat" ? rule.value : 0;
  return Math.max(0, Math.min(Math.round(raw), Math.round(shopTotal)));
}

/** How the rule reads on a bill: "3%" or "₹10" (empty when there is none). */
export function appChargeBasis(rule: AppChargeRule): string {
  if (rule.mode === "percent") return `${Number(rule.value)}%`;
  if (rule.mode === "flat") return `₹${Number(rule.value)}`;
  return "";
}
