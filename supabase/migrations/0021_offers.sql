-- 0021: offers and coupons, configured from the admin app.
--  • offers covers both kinds: 'banner' offers apply by themselves, 'coupon'
--    offers need their code typed in the cart. Only the single best discount
--    applies to an order, never two together.
--  • Who funds it: shop_share_pct says how much of each discount the shop
--    absorbs (the rest comes out of FreshCut's margin). Settlement reads the
--    per-order split from offer_redemptions.
--  • The API (service role) computes every discount; apps only preview it.

create table offers (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('banner', 'coupon')),
  code text unique check (code = upper(code)),       -- coupons only, e.g. FIRST50
  title text not null,
  title_ta text,
  subtitle text,
  image_path text,                                   -- product-images bucket (offers/…)
  tint text,                                         -- banner background, e.g. '#FFE1D3'
  discount_type text not null check (discount_type in ('percent', 'flat')),
  discount_value numeric(10,2) not null check (discount_value > 0),
  max_discount numeric(10,2),                        -- cap for percent offers
  min_order numeric(10,2),                           -- on the items total
  category_id uuid references categories(id),        -- scope: null = everything
  subcategory_id uuid references subcategories(id),
  product_ids uuid[],                                -- specific products, overrides the above
  pincodes text[],                                   -- null = everywhere
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_active boolean not null default true,           -- pause switch
  sort int not null default 0,                       -- banner order on the home screen
  shop_share_pct numeric(5,2) not null default 0 check (shop_share_pct between 0 and 100),
  first_order_only boolean not null default false,
  per_customer_limit int,                            -- default: coupons 1, banners unlimited (API enforces)
  total_limit int,                                   -- stop after this many redemptions
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (kind <> 'coupon' or code is not null)
);
create index offers_live_idx on offers (starts_at, ends_at) where is_active;
create trigger offers_updated_at before update on offers
  for each row execute function set_updated_at();

create table offer_redemptions (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references offers(id),
  order_id uuid not null unique references orders(id) on delete cascade,
  customer_id uuid not null references profiles(id),
  code text,
  discount numeric(10,2) not null,
  shop_share numeric(10,2) not null default 0,       -- the shop's part of the discount
  created_at timestamptz not null default now()
);
create index offer_redemptions_offer_idx on offer_redemptions(offer_id);
create index offer_redemptions_customer_idx on offer_redemptions(customer_id, offer_id);

alter table orders
  add column if not exists offer_id uuid references offers(id),
  add column if not exists coupon_code text,
  add column if not exists discount_amount numeric(10,2),
  add column if not exists discount_shop_share numeric(10,2);
comment on column orders.discount_amount is 'Rupees off the items total (never the delivery fee); already subtracted from est_amount/final_amount';

-- Customers see live offers (banners, price tags); admins see everything.
alter table offers enable row level security;
create policy "live offers" on offers for select using (
  is_admin() or (is_active and starts_at <= now() and ends_at > now())
);
grant select on offers to authenticated;
grant all on offers to service_role;

alter table offer_redemptions enable row level security;
create policy "own redemptions" on offer_redemptions for select using (customer_id = auth.uid() or is_admin());
grant select on offer_redemptions to authenticated;
grant all on offer_redemptions to service_role;
