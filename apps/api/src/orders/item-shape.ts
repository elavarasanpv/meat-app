/**
 * Order lines come in two shapes: meat (`product_id` → products) and grocery
 * (`master_product_id` → master_products). Every screen that renders an order
 * was written against `products`; this fills that slot from the master row so
 * the partner/rider/admin apps need no change to show a grocery line.
 *
 * Select both embeds, e.g. `products(name, name_ta, unit), master_products(name, name_ta, unit)`.
 */
export type MasterLite = { name: string; name_ta?: string | null; unit?: string | null; image_path?: string | null } | null;

export function withProductShape<T extends { products?: unknown; master_products?: MasterLite }>(item: T): Omit<T, "master_products"> {
  const { master_products, ...rest } = item;
  if (rest.products || !master_products) return rest;
  // Packs and pieces are both counted; only loose items are weighed.
  const unit = master_products.unit === "kg" ? "kg" : "piece";
  return { ...rest, products: { ...master_products, unit } };
}

export function withProductShapes<T extends { products?: unknown; master_products?: MasterLite }>(items: T[] | null | undefined): Omit<T, "master_products">[] {
  return (items ?? []).map(withProductShape);
}
