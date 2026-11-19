# Grocery vertical — G1 spec (catalog foundations)

Status: **draft, not applied**. Migration: `supabase/migrations/0030_grocery_g1.sql`.

G1 lays the data model and the admin tooling for a second vertical on the
FreshCut rails, shipped **dormant**: nothing a meat customer, dealer or rider
sees changes until an admin flips `verticals.grocery.is_active`.

## 1. Goals / non-goals

**Goals**
- A shop-owned grocery catalog that scales to 2–5k SKUs per store and 50+ stores.
- The same two-price model meat uses (shop price vs selling price, gap = platform
  revenue), enforced in the database.
- Three onboarding on-ramps: billing-software import, barcode scan, price-list photo.
- A pending → approved flow for new master items that never blocks a shop from selling.
- Zero change to the meat app's behaviour or query cost.

**Non-goals for G1** (land in G2/G3)
- Customer app grocery browsing/cart/checkout (G2) and the grocery order function.
- Partner app grocery screens beyond read-only "My catalog" (G3).
- Stock counts with decrement-on-order (keep `out_of_stock_until` booleans first).
- POS live integration — none of the small-town billing systems expose an API;
  periodic re-upload is the sync.

## 2. Blast radius — what touches the meat path

| Existing object | Change | Risk |
|---|---|---|
| `dealers` | `+ store_type text not null default 'meat' references verticals` | None. Constant-default column add is metadata-only on PG ≥ 11; no query filters on it yet. |
| `supabase_migrations.schema_migrations` | version row `0030` | None. |
| everything else (`categories`, `products`, `dealer_products`, `product_prices`, `price_history`, `orders`, `order_items`, `create_order`, `add_order_items`, `transition_*`, all policies) | **untouched** | — |

Why grocery does **not** reuse `categories`/`products`: the customer app reads
`categories where is_active` and `products where is_active` with no vertical
filter (`apps/customer/src/hooks/useCatalog.ts`), and admin-ops lists all
products. A `store_type` column on those tables would leak grocery rows into the
meat home screen the moment the first grocery category is created. Separate
tables make the guarantee structural instead of relying on every query adding a
filter. Meat may migrate onto the generic tables later; it doesn't have to.

Performance: every new table is only ever joined from its own vertical's
queries; FK + partial indexes are in place; the only new triggers are
`updated_at` touches on the new tables. No trigger, index or policy was added to
a meat table.

## 3. Data model

```
verticals ──┬── catalog_categories (2-level tree, admin-owned)
            │
            ├── master_products ── store_products ── dealers (store_type)
            │       barcode-unique       two prices + MRP cap
            │       status: pending/approved/rejected
            │       scope: shared / store (custom, owner_dealer_id)
            │
            ├── catalog_imports ── catalog_import_rows
            └── delivery_fee_rules
```

### Pricing invariant (CHECK-enforced on `store_products`)

```
shop_price ≤ selling_price ≤ mrp      (mrp null ⇒ no cap: loose/custom items)
price_mode = 'same'  ⇒ selling_price = shop_price
```

- `shop_price` — what the shop is paid per unit. Shop-owned.
- `selling_price` — what the customer pays. Defaults to shop price (toggle ON).
- Toggle OFF (`price_mode = 'custom'`) by the shop: "my price ₹95, customer pays
  ₹100" — the shop giving the platform margin.
- Admin override: sets `selling_price` and `selling_set_by = 'admin'`, which
  **locks** it; the shop can still change its own price (changing the gap), not
  the selling price. Admin can hand it back.
- A selling price *below* shop price is never a listing — that's an `offers` row,
  so a subsidy is always a deliberate, funded decision.
- Every change is logged in `store_price_history` (`kind` shop/sell, `changed_by`).
- The shop always sees three numbers: *You get · Customer pays · FreshCut*.

Revenue floor is the delivery fee (`delivery_fee_rules`, seeded grocery: min
order ₹99, fee ₹20, free above ₹499). Margin on packaged goods is upside.

### Approval flow (the two lists)

```
shop adds an item
  ├─ barcode or name matches master (any status) → attaches. No request.
  └─ genuinely new → master_products(status='pending', owner_dealer_id=shop)
        • sellable immediately in that shop (RLS lets the owner see it)
        • lands in admin's Pending queue
        • approve  → status='approved', scope='shared'  (every store can list it)
        • keep own → status='approved', scope='store'   (homemade murukku stays theirs)
        • reject   → status='rejected'  (hidden from listings; owner told why)
```

Four rules that make it scale:
1. **Listing ≠ requesting.** A store listing an existing master product (price +
   stock) never needs approval. Only new master candidates queue.
2. **Dedupe before the queue.** `barcode` is unique across the master regardless
   of status; no-barcode items get a trigram name match (`pg_trgm`) and a
   "did you mean" suggestion before "add new" is allowed.
3. **Pending is sellable** — the shop is never blocked on the admin.
4. **Bulk tools + seeded master** — approve by category, inline edit, and a
   pre-seeded packaged-FMCG master so most of a kirana's items already exist.

### Visibility gate

RLS on every grocery table checks `vertical_is_active(vertical_type)` for app
users, with two exceptions: the owning shop always sees its own
`store_products`, own pending/store-scoped `master_products`, imports and price
history (so onboarding works before launch), and `is_admin()` sees everything.
The NestJS API uses `service_role` and bypasses RLS. Activating grocery is:

```sql
update verticals set is_active = true where type = 'grocery';
```

No app release needed, provided the G2/G3 UI shipped dormant behind the same flag.

## 4. Onboarding pipeline

All three on-ramps feed one review flow (`catalog_imports` → `catalog_import_rows`).

| Source | Input | Parsing |
|---|---|---|
| `csv` | Excel/CSV export from Tally / Marg / Vyapar / GoFrugal / Busy / local POS | Column mapper (name, barcode, MRP, rate, unit, stock); header aliases per known system |
| `photo` | Printed rate card / billing printout | Gemini Vision → rows (same stack as PaperHint's OCR) |
| `scan` | Barcode via phone camera, one item at a time | Direct master lookup; prefill name/image/MRP |

Per row, the matcher sets `match_status`:
- `matched` — barcode hit (or confirmed name match) → will upsert `store_products`
  with `shop_price = rate`, `mrp = master.mrp`, `selling = shop` (mode `same`).
- `review` — fuzzy name candidate in `suggested_master_product_id`; shop/admin
  confirms or marks new.
- `new` — no candidate → creates a pending `master_products` row on apply.
- `rejected` — bad row (no name, rate > MRP flagged as `issue`, etc.).

Apply is idempotent per import (rows flip to `applied`); re-uploads update
prices on existing listings and only queue truly new items.

## 5. API surface (NestJS, new `catalog` module)

Admin (guarded by `admin.guard`):
- `GET/POST/PATCH /admin/catalog/categories` — tree per vertical
- `GET /admin/catalog/master?status=&vertical=&q=` — search/filter, trigram `q`
- `POST /admin/catalog/master` · `PATCH /admin/catalog/master/:id` — create/edit (name_ta, category, pack, MRP, image)
- `POST /admin/catalog/master/:id/approve|keep-own|reject` · `POST /admin/catalog/master/bulk-approve`
- `POST /admin/catalog/master/:id/merge-into/:targetId` — duplicate cleanup (re-points store_products, keeps barcode)
- `GET/PATCH /admin/catalog/stores/:dealerId/products` — a shop's listings; admin selling override (`selling_set_by='admin'`)
- `GET/POST/PATCH /admin/catalog/fee-rules`
- `PATCH /admin/shops/:id` gains `store_type`

Dealer (grocery shops; existing dealer auth):
- `GET /dealer/catalog` — own listings joined to master (status, three prices, stock)
- `POST /dealer/catalog/search?q=|barcode=` — master lookup before "add new"
- `POST /dealer/catalog/list` — list a master product (shop price, mode, selling)
- `POST /dealer/catalog/custom` — create pending/store item + listing in one call
- `PATCH /dealer/catalog/:masterId` — price/stock; refuses selling edits when `selling_set_by='admin'`
- `POST /dealer/catalog/imports` (multipart) · `GET /dealer/catalog/imports/:id` · `POST …/:id/rows/:rowId` (confirm/mark-new) · `POST …/:id/apply`

Every price write: validate invariant (the DB re-checks), insert
`store_price_history`. Every master write: `updated_at` via trigger.

## 6. Admin panel (G1 ships these)

- **Shops** — store type on create/edit; filter by type.
- **Catalog › Categories** — per-vertical tree editor (English + Tamil, image, sort).
- **Catalog › Master** — approved list: search, category filter, edit, merge duplicates, deactivate.
- **Catalog › Pending** — queue with inline edit of name/name_ta/category/pack/MRP, image upload, Approve / Keep store-only / Reject, bulk approve by category, "submitted by" + how many stores already list it.
- **Catalog › Imports** — every store's imports, counts, open the review grid on a store's behalf.
- **Shop detail › Catalog tab** — the store's listings with the three prices; admin selling override with lock indicator; export CSV.
- **Settings › Delivery fees** — rules per vertical/zone.
- **Settings › Verticals** — the activation switch (with a confirm dialog).

## 7. Partner app (G1: read-only preview; G3: full)

G1 adds only a hidden **My catalog** screen behind `store_type = 'grocery'`
(no grocery shops exist in prod yet, so nothing renders): list + search of own
listings showing *You get · Customer pays · FreshCut*, stock toggle reusing the
`out_of_stock_until` logic from `dealer_products`. Import, scan, custom-add and
the substitution flow in orders are G3.

## 8. Test plan

- **Migration on a scratch project**: `supabase db reset` + push; verify the
  meat seed (`categories`, `products`) counts and `useCategories` query results
  are byte-identical before/after.
- **RLS**: as a customer with grocery inactive → zero rows from every grocery
  table; as a grocery dealer → own listings only; flip the vertical → customers
  see approved shared items and active listings of active grocery dealers.
- **Invariant**: inserts with `selling < shop`, `selling > mrp`,
  `mode='same'` with differing prices all fail at the DB.
- **Dedupe**: second store importing the same barcode attaches, no new master row.
- **Idempotent import**: apply twice → same listings, prices updated, no duplicates.
- **Meat regression**: run the existing order smoke (place → accept → pack → deliver)
  on a meat dealer after the migration.

## 9. Rollback

G1 is additive; rollback is a drop in reverse dependency order plus the one
column:

```sql
drop table if exists catalog_import_rows, catalog_imports, store_price_history,
  store_products, master_products, catalog_categories, delivery_fee_rules;
alter table dealers drop column if exists store_type;
drop function if exists vertical_is_active(text), my_dealer_id(), my_store_type(),
  dealer_sells_live_vertical(uuid), touch_updated_at();
drop table if exists verticals;
delete from supabase_migrations.schema_migrations where version = '0030';
```

## 10. Open decisions (decide before G2)

1. **Order scope**: one order = one shop (today's rule). Keep — riders don't
   multi-pick, and it avoids cross-vertical carts.
2. **Substitutions**: when a packed item is out of stock, offer replacement vs
   remove-and-refund. Needs an `order_items` status beyond `unavailable`; G3.
3. **Stock counts**: start with the boolean; add decrement-on-accept only if
   oversells become real.
4. **Master seeding**: Open Food Facts dump for Indian FMCG (barcode, name,
   brand, pack, image) — needs a one-off import script and image hosting review.
