# Grocery G2 — ordering (migration 0031)

Builds on [grocery-g1.md](grocery-g1.md). G2 lets a customer buy from **one
grocery shop** they pick, priced from that shop's listing, with the delivery
fee read from `delivery_fee_rules`. Everything stays dormant until
`verticals.grocery.is_active = true`; the customer app ships the screens
behind that flag so going live is a data change, not a release.

## 1. What shipped

| Layer | Change |
|---|---|
| DB | `orders.vertical_type` (default `meat`), `order_items.master_product_id` + `shop_unit_price`, `product_id` nullable with CHECK "exactly one of product_id / master_product_id", `create_grocery_order()`, `grocery_stores(pincode)`, `grocery_fee(pincode)`, `master_listed_live()` + widened `master_products` read policy |
| Shared | `placeGroceryOrderSchema` (`addressId, dealerId, slot, paymentMode, items[{masterProductId, qty, notes}]`, max 40 lines, no coupons) |
| API | `POST /orders/grocery` → `create_grocery_order` → `AssignmentService.offerTo(order, dealer)` (same 5-min accept window + ring). `offer()` re-rings the same shop up to 3 times for grocery instead of hunting for another. Item-name shim `orders/item-shape.ts` fills `products` from `master_products` for dealer / rider / admin reads |
| Customer | Home shows a *Meat & fish / Grocery* switch when live → `/grocery` (shops for the home pincode) → `/grocery/[storeId]` (search, category chips, MRP/price rows, stepper). Basket carries `vertical` + `dealerId`; mixing verticals/shops asks before replacing. Bill uses the fee rule, hides coupons, warns below minimum. Checkout branches to `/orders/grocery`. Orders list/detail render grocery lines; *Order again* rebuilds a grocery basket |

## 2. Blast radius on the meat path

- `create_order()` / `add_order_items()`: **unchanged**.
- `orders` gains one column with a constant default → catalog-only change, no rewrite. Every existing row reads `meat`.
- `order_items.product_id` loses NOT NULL. Nothing in the meat code inserts without it; the CHECK keeps a line from having neither/both ids. The CHECK scan ran in well under a second on scratch; expect the same in prod (small table).
- API reads add a second embed (`master_products(...)`) next to `products(...)`; for meat rows it is `null` and the shim leaves `products` untouched. The partner app's `DealerOrderItem.products` stays non-null for both verticals.
- Customer `useOrders` query key bumped `v2 → v3` so cached summaries from older builds are discarded.

## 3. Invariants enforced in `create_grocery_order`

1. Vertical live, address belongs to the customer, slot in the future.
2. Shop is active, `store_type = 'grocery'`, serves the address pincode, open now (`is_open` and not `closed_until`).
3. Each line: master active & not rejected, listed by this shop and active, in stock, `qty ≥ min_qty`, whole `qty_step`s, ≤ 50 kg / 99 units, no duplicates.
4. `items ≥ min_order` from `grocery_fee(pincode)` (zone rule first, else vertical-wide); fee = 0 when `items ≥ free_above`.
5. Prices snapshot: `unit_price_per_kg = selling_price`, `shop_unit_price = shop_price`.
6. Display id `GR-MMDD-nnnn` from the shared daily sequence.

Error codes match meat so the API maps them identically: `P0002` → 404, `FC409` → 409, `P0001` → 400 (message is customer-readable, e.g. "Minimum order is ₹99").

## 4. Scratch test (0001–0031 on local PG 18, 2026-11-19)

| # | Case | Result |
|---|---|---|
| T1 | vertical off | `grocery_stores` empty; order refused |
| T2 | vertical on | shop listed with `item_count`; fee 99/20/499; unknown pincode falls back to the vertical rule |
| T3 | ₹84 basket | "Minimum order is ₹99" |
| T4 | 0.3 kg of a 0.25-step item · rejected master | "bad quantity" · "not available" |
| T5 | shop closed | FC409 "closed right now" |
| T6 | listing out of stock | FC409 "out of stock" |
| T7 | 3 packs @42 + 1.5 kg @60 | `GR-1119-0001`, est 236 (216 + 20), 2 lines, shop prices 38/60 snapshotted, `product_id` null |
| T8 | 12 packs = 504 | fee 0, est 504 |
| T9 | line with neither id | CHECK violation |
| T10 | meat `create_order` | still works, `vertical_type = meat`, line has `product_id` |
| T11 | as customer (RLS) | `grocery_stores` returns the shop, `dealers` still hidden, own grocery orders visible, listings visible |
| policy | store-scope pending item listed by a live shop | visible to customers; hidden once the shop is inactive |

## 5. Going live checklist

1. Run 0031 in the SQL editor (after 0030).
2. Enrol a grocery shop (Shops → *What the shop sells* = Grocery) and import its list (Catalog → Imports).
3. Check `delivery_fee_rules` for the zone.
4. Customer app build that includes this commit must be on the stores before the flag is flipped (the switch is read live; older builds simply never show it).
5. Admin → Catalog → *Switch grocery on*.

## 6. Not in G2 (→ G3)

- Partner app grocery screens: order card still says "pieces" for packs; no pack/scan/substitution flow; `packOrderSchema` requires a label + scale photo that grocery doesn't need.
- Settlement reports by `shop_unit_price`.
- Offers/coupons on grocery baskets.
- Stock decrement on accept; substitutions.

## 7. Rollback

```sql
drop function if exists create_grocery_order(uuid,uuid,uuid,timestamptz,timestamptz,payment_mode,jsonb,text,text);
drop function if exists grocery_stores(text), grocery_fee(text);
drop policy if exists "read master products" on master_products;  -- then re-create the 0030 version
drop function if exists master_listed_live(uuid);
drop index if exists store_products_master_live_idx, orders_grocery_idx, order_items_master_idx;
alter table order_items drop constraint order_items_one_product;
alter table order_items drop column master_product_id, drop column shop_unit_price;
alter table order_items alter column product_id set not null;   -- only if no grocery lines exist
alter table orders drop column vertical_type;
delete from supabase_migrations.schema_migrations where version = '0031';
```
