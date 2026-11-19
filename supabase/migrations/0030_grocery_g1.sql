-- 0030: Grocery vertical — G1 (catalog foundations). Purely additive.
--
-- NON-BREAKING GUARANTEE (what the meat app relies on, and what this file
-- does to it):
--   • categories / subcategories / products / dealer_products / product_prices
--     / price_history / orders / order_items / create_order / add_order_items /
--     transition_* — NOT TOUCHED. Not a column, not a policy, not a trigger.
--     The customer app's useCategories()/useProducts() queries, the partner
--     app's dealer_products reads and the admin pricing screens keep returning
--     exactly what they return today.
--   • dealers gains ONE column, store_type text default 'meat'. Adding a
--     column with a constant default is a metadata-only change on Postgres 11+
--     (no table rewrite, no lock beyond the DDL instant). Nothing filters on it
--     yet, so every existing dealer query is unchanged.
--   • Everything else is new tables that no existing query joins to, with
--     their own indexes. Zero cost on the meat path.
--
-- VISIBILITY GATE ("deactivated state"): grocery rows are invisible to app
-- users until verticals.is_active = true for 'grocery'. Enforced in RLS, not
-- in the apps, so flipping it on is a one-row update with no app release.
-- The service_role (NestJS API) bypasses RLS — admin tooling sees everything.
--
-- MODEL (see docs/grocery-g1.md):
--   verticals            — meat (active) / grocery (inactive) switchboard
--   catalog_categories   — admin-owned category tree per vertical (2 levels)
--   master_products      — shared product master (barcode-unique) with an
--                          approval status; store-only custom items live here
--                          too with scope = 'store'
--   store_products       — a shop's listing: shop price + selling price + MRP
--                          cap, enforced by CHECK. The gap is platform revenue.
--   catalog_imports(+rows) — billing-software CSV / price-list photo / scan
--                          onboarding, with per-row match status
--   delivery_fee_rules   — per-vertical/zone delivery fee (meat keeps its
--                          hard-coded rule in create_order; untouched)

-- ──────────────────────────────── verticals ────────────────────────────
create table verticals (
  type        text primary key,                    -- 'meat' | 'grocery' | ...
  label       text not null,
  label_ta    text,
  sort        int not null default 0,
  is_active   boolean not null default false,      -- the deactivated-state switch
  created_at  timestamptz not null default now()
);
comment on table verticals is 'One row per store vertical. is_active gates every grocery table''s RLS for app users; meat is live, grocery ships dormant.';

insert into verticals (type, label, label_ta, sort, is_active) values
  ('meat',    'Meat',    'இறைச்சி', 1, true),
  ('grocery', 'Grocery', 'மளிகை',   2, false);

-- ──────────────────────────────── dealers.store_type ───────────────────
-- Metadata-only ALTER (constant default). Existing rows read as 'meat'.
alter table dealers add column if not exists store_type text not null default 'meat'
  references verticals(type);
comment on column dealers.store_type is 'Which vertical this shop sells. Meat dealers keep the legacy catalog tables; grocery shops use master_products/store_products.';

-- ──────────────────────────────── categories ───────────────────────────
-- Separate from the meat `categories` table on purpose: the customer app
-- reads `categories where is_active` with no vertical filter, so sharing the
-- table would leak grocery rows into the meat home screen.
create table catalog_categories (
  id            uuid primary key default gen_random_uuid(),
  vertical_type text not null references verticals(type),
  parent_id     uuid references catalog_categories(id) on delete cascade, -- null = top level
  name          text not null,
  name_ta       text,
  image_path    text,
  sort          int not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index catalog_categories_vertical_idx on catalog_categories (vertical_type, parent_id, sort);
comment on table catalog_categories is 'Admin-owned category tree per vertical; parent_id gives the optional second level (Staples → Rice / Dal).';

-- ──────────────────────────────── master products ──────────────────────
create table master_products (
  id               uuid primary key default gen_random_uuid(),
  vertical_type    text not null references verticals(type),
  category_id      uuid references catalog_categories(id),
  -- identity
  barcode          text,                            -- EAN/UPC; null for loose + custom
  name             text not null,
  name_ta          text,
  brand            text,
  pack_size        text,                            -- "500 g", "1 L", "12 pcs"
  unit             text not null default 'piece'
                     check (unit in ('piece', 'pack', 'kg')),
  -- loose/kg items: how the customer picks quantity
  min_qty          numeric(6,3) not null default 1,  -- kg items: 0.25
  qty_step         numeric(6,3) not null default 1,  -- kg items: 0.25
  mrp              numeric(10,2) check (mrp is null or mrp > 0), -- null = no MRP (loose, custom)
  image_path       text,
  -- ownership + approval
  scope            text not null default 'shared'
                     check (scope in ('shared', 'store')),  -- store = this shop's own item
  status           text not null default 'pending'
                     check (status in ('pending', 'approved', 'rejected')),
  owner_dealer_id  uuid references dealers(id) on delete set null, -- submitter / owner for store scope
  reviewed_by      uuid references profiles(id),
  reviewed_at      timestamptz,
  review_note      text,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- a store-only item must have an owner
  check (scope = 'shared' or owner_dealer_id is not null)
);
-- Barcode dedupe across the whole master, regardless of status — the second
-- shop adding the same packaged item attaches to the first row.
create unique index master_products_barcode_uq on master_products (barcode) where barcode is not null;
create index master_products_vertical_status_idx on master_products (vertical_type, status, category_id);
create index master_products_owner_idx on master_products (owner_dealer_id) where owner_dealer_id is not null;
-- name search for the "did you mean" match (pg_trgm is enabled on Supabase)
create extension if not exists pg_trgm;
create index master_products_name_trgm on master_products using gin (lower(name) gin_trgm_ops);
comment on table master_products is 'Shared product master for non-meat verticals. status=pending rows are already sellable by their owner store; approval only widens visibility to every store.';

-- ──────────────────────────────── store products (listings) ────────────
create table store_products (
  dealer_id          uuid not null references dealers(id) on delete cascade,
  master_product_id  uuid not null references master_products(id) on delete cascade,
  -- two-price model, same semantics as meat (dealer_products.price_per_kg vs
  -- products.base_price_per_kg): the shop is paid shop_price, the customer
  -- pays selling_price, the gap is platform revenue.
  shop_price         numeric(10,2) not null check (shop_price > 0),
  selling_price      numeric(10,2) not null,
  mrp                numeric(10,2),                 -- denormalised at listing time so the CHECK is local
  price_mode         text not null default 'same'
                       check (price_mode in ('same', 'custom')),
  selling_set_by     text not null default 'store'
                       check (selling_set_by in ('store', 'admin')),  -- admin = locked
  -- stock: mirrors dealer_products.out_of_stock_until so the partner app
  -- can reuse its toggle logic
  out_of_stock_until timestamptz,                   -- null = in stock; 'infinity' = until switched on
  stock_qty          int,                           -- optional counts, null = not tracked
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  primary key (dealer_id, master_product_id),
  -- THE invariant: shop ≤ selling ≤ MRP. A discount below shop price is an
  -- offer (offers table), never a listing price.
  check (selling_price >= shop_price),
  check (mrp is null or selling_price <= mrp),
  check (price_mode = 'custom' or selling_price = shop_price)
);
create index store_products_product_idx on store_products (master_product_id);
create index store_products_dealer_active_idx on store_products (dealer_id) where is_active;
comment on table store_products is 'A shop''s listing of a master product with its two prices. Writes go through the API so price_history is kept; the CHECKs make the invariant hold regardless.';

-- Price audit for grocery, separate from the meat price_history (which keys
-- on products.id and would otherwise need a nullable FK change).
create table store_price_history (
  id                 bigint generated always as identity primary key,
  dealer_id          uuid not null references dealers(id) on delete cascade,
  master_product_id  uuid not null references master_products(id) on delete cascade,
  kind               text not null check (kind in ('shop', 'sell')),
  old_price          numeric(10,2),
  new_price          numeric(10,2) not null,
  changed_by         uuid references profiles(id),
  created_at         timestamptz not null default now()
);
create index store_price_history_idx on store_price_history (dealer_id, master_product_id, created_at desc);

-- ──────────────────────────────── imports ──────────────────────────────
create table catalog_imports (
  id          uuid primary key default gen_random_uuid(),
  dealer_id   uuid not null references dealers(id) on delete cascade,
  source      text not null check (source in ('csv', 'photo', 'scan')),
  file_path   text,                                 -- storage path of the upload
  status      text not null default 'uploaded'
                check (status in ('uploaded', 'parsing', 'review', 'applied', 'failed')),
  total_rows  int not null default 0,
  matched     int not null default 0,
  needs_review int not null default 0,
  new_items   int not null default 0,
  error       text,
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now(),
  applied_at  timestamptz
);
create index catalog_imports_dealer_idx on catalog_imports (dealer_id, created_at desc);

create table catalog_import_rows (
  id                           bigint generated always as identity primary key,
  import_id                    uuid not null references catalog_imports(id) on delete cascade,
  row_no                       int not null,
  raw                          jsonb not null,      -- the row as parsed, for audit + re-mapping
  barcode                      text,
  name                         text,
  mrp                          numeric(10,2),
  rate                         numeric(10,2),       -- the shop's billing rate → shop_price
  unit                         text,
  match_status                 text not null default 'review'
                                 check (match_status in ('matched', 'review', 'new', 'rejected', 'applied')),
  master_product_id            uuid references master_products(id),  -- confirmed match
  suggested_master_product_id  uuid references master_products(id),  -- fuzzy candidate
  issue                        text                 -- e.g. 'rate above mrp'
);
create index catalog_import_rows_import_idx on catalog_import_rows (import_id, match_status);

-- ──────────────────────────────── delivery fee rules ───────────────────
-- Meat keeps the rule hard-coded in create_order (>= 499 free, else 20).
-- Grocery's order function (G2) reads this table instead.
create table delivery_fee_rules (
  id            uuid primary key default gen_random_uuid(),
  vertical_type text not null references verticals(type),
  zone_id       uuid references zones(id),          -- null = every zone
  min_order     numeric(10,2) not null default 0,   -- below this: order refused
  fee           numeric(10,2) not null default 0,
  free_above    numeric(10,2),                      -- null = never free
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index delivery_fee_rules_idx on delivery_fee_rules (vertical_type, zone_id) where is_active;

insert into delivery_fee_rules (vertical_type, zone_id, min_order, fee, free_above)
values ('grocery', null, 99, 20, 499);

-- ──────────────────────────────── updated_at upkeep ────────────────────
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger master_products_touch before update on master_products
  for each row execute function touch_updated_at();
create trigger store_products_touch before update on store_products
  for each row execute function touch_updated_at();

-- ──────────────────────────────── RLS + grants ─────────────────────────
-- Same posture as the rest of the schema: the project has auto-expose OFF,
-- so nothing is reachable until granted here; RLS decides rows. All writes
-- go through the API (service_role, bypasses RLS) — app users only read.
alter table verticals            enable row level security;
alter table catalog_categories   enable row level security;
alter table master_products      enable row level security;
alter table store_products       enable row level security;
alter table store_price_history  enable row level security;
alter table catalog_imports      enable row level security;
alter table catalog_import_rows  enable row level security;
alter table delivery_fee_rules   enable row level security;

grant select on verticals, catalog_categories, master_products, store_products,
                delivery_fee_rules, catalog_imports, catalog_import_rows
  to authenticated;
grant all on verticals, catalog_categories, master_products, store_products,
             store_price_history, catalog_imports, catalog_import_rows, delivery_fee_rules
  to service_role;
grant usage, select on all sequences in schema public to service_role;

-- A vertical is visible when it is switched on.
create policy "read active verticals" on verticals
  for select using (auth.uid() is not null);

-- The gate: rows of an inactive vertical are invisible to app users. The
-- owning shop is the one exception — it must see its own listings while
-- onboarding before the vertical goes live.
create or replace function vertical_is_active(p_type text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from verticals where type = p_type and is_active)
$$;
grant execute on function vertical_is_active(text) to authenticated;

create or replace function my_dealer_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from dealers where profile_id = auth.uid()
$$;
grant execute on function my_dealer_id() to authenticated;

-- The caller's own vertical (null for customers/riders). security definer so
-- it doesn't depend on what the dealers RLS lets the caller see.
create or replace function my_store_type() returns text
language sql stable security definer set search_path = public as $$
  select store_type from dealers where profile_id = auth.uid()
$$;
grant execute on function my_store_type() to authenticated;

-- "Is this shop open for business in a live vertical?" — evaluated with
-- definer rights because a customer's RLS view of `dealers` may not include
-- the row, which would silently hide every listing.
create or replace function dealer_sells_live_vertical(p_dealer uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from dealers d
    join verticals v on v.type = d.store_type
    where d.id = p_dealer and d.is_active and v.is_active
  )
$$;
grant execute on function dealer_sells_live_vertical(uuid) to authenticated;

create policy "read categories of live verticals" on catalog_categories
  for select using (
    auth.uid() is not null
    and is_active
    and (vertical_is_active(vertical_type) or is_admin())
  );

create policy "read master products" on master_products
  for select using (
    auth.uid() is not null
    and status <> 'rejected'
    and is_active
    and (
      -- live vertical: everyone sees shared + approved; store-scoped items
      -- surface only through the owner's listing (customers browse a store)
      (vertical_is_active(vertical_type) and scope = 'shared' and status = 'approved')
      -- a shop of this vertical sees the shared master before launch, so it
      -- can search and list items while onboarding
      or (scope = 'shared' and status = 'approved' and my_store_type() = vertical_type)
      or owner_dealer_id = my_dealer_id()     -- the owner always sees their own, live or not
      or is_admin()
    )
  );

create policy "read store products" on store_products
  for select using (
    auth.uid() is not null
    and (
      dealer_id = my_dealer_id()               -- the shop sees its own listings, always
      or is_admin()
      -- customers: only active listings of an active shop in a live vertical.
      -- Definer-rights helper: a customer's RLS view of dealers is empty
      -- ("own dealer row" policy), so an inline exists() would never match.
      or (is_active and dealer_sells_live_vertical(dealer_id))
    )
  );

create policy "shop reads own price history" on store_price_history
  for select using (dealer_id = my_dealer_id() or is_admin());

create policy "shop reads own imports" on catalog_imports
  for select using (dealer_id = my_dealer_id() or is_admin());
create policy "shop reads own import rows" on catalog_import_rows
  for select using (
    exists (select 1 from catalog_imports i where i.id = import_id and (i.dealer_id = my_dealer_id() or is_admin()))
  );

create policy "read fee rules of live verticals" on delivery_fee_rules
  for select using (auth.uid() is not null and is_active and (vertical_is_active(vertical_type) or is_admin()));

insert into supabase_migrations.schema_migrations (version, name)
values ('0030', 'grocery_g1') on conflict (version) do nothing;
