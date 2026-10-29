-- 0015: dealer operations.
-- Shop hours & closures, service pincodes, stock windows, order ready time,
-- unavailable items, the assignment log, and push tokens.
-- Pricing model: dealer_products.price_per_kg is the SHOP (cost) price we owe
-- the shop; products.base_price_per_kg stays the selling price customers see.
-- The margin between them is our revenue — no commission.

-- ───────────────────────── shop hours & closures ─────────────────────────
alter table dealers
  add column if not exists open_windows jsonb not null default '[["06:00","13:00"],["16:00","20:00"]]',
  add column if not exists weekly_off smallint check (weekly_off between 0 and 6),
  add column if not exists closed_until timestamptz;

comment on column dealers.open_windows is 'Daily opening windows in local time, e.g. [["06:00","13:00"],["16:00","20:00"]]';
comment on column dealers.weekly_off is 'Day of week the shop is closed (0=Sunday … 6=Saturday); null = none';
comment on column dealers.closed_until is 'Closed until this moment (festival/travel). null = follow is_open + open_windows';
comment on column dealers.commission_pct is 'UNUSED — revenue is the price margin, not a commission';

-- ───────────────────────── service area ─────────────────────────
create table dealer_pincodes (
  dealer_id uuid not null references dealers(id) on delete cascade,
  pincode text not null check (pincode ~ '^[1-9][0-9]{5}$'),
  primary key (dealer_id, pincode)
);
create index dealer_pincodes_pincode_idx on dealer_pincodes(pincode);

-- ───────────────────────── stock ─────────────────────────
comment on column dealer_products.price_per_kg is 'Shop (cost) price per kg/piece owed to the shop; selling price is products.base_price_per_kg';
alter table dealer_products
  drop column if exists available_today,
  add column if not exists out_of_stock_until timestamptz;
comment on column dealer_products.out_of_stock_until is 'null = in stock; a time = out of stock until then; ''infinity'' = until switched back on';

-- ───────────────────────── orders ─────────────────────────
alter table orders add column if not exists ready_by timestamptz;
comment on column orders.ready_by is 'When the shop promised the order will be packed (accept time + ready minutes)';

alter table order_items add column if not exists unavailable boolean not null default false;
comment on column order_items.unavailable is 'Shop could not supply this item; excluded from the bill';

-- ───────────────────────── assignment log ─────────────────────────
-- One row per shop an order was offered to. The pending row carries the
-- 5-minute deadline; the sweeper times it out and offers the next shop.
create table order_assignments (
  id bigint generated always as identity primary key,
  order_id uuid not null references orders(id) on delete cascade,
  dealer_id uuid not null references dealers(id),
  offered_at timestamptz not null default now(),
  deadline_at timestamptz not null,
  responded_at timestamptz,
  outcome text not null default 'pending'
    check (outcome in ('pending', 'accepted', 'rejected', 'timeout', 'cancelled')),
  reason text
);
create index order_assignments_order_idx on order_assignments(order_id);
create index order_assignments_dealer_idx on order_assignments(dealer_id, outcome);
create index order_assignments_pending_idx on order_assignments(deadline_at) where outcome = 'pending';

-- ───────────────────────── push tokens ─────────────────────────
create table push_tokens (
  profile_id uuid not null references profiles(id) on delete cascade,
  token text not null,
  platform text not null default 'android',
  updated_at timestamptz not null default now(),
  primary key (profile_id, token)
);

-- ───────────────────────── RLS ─────────────────────────
alter table dealer_pincodes enable row level security;
alter table order_assignments enable row level security;
alter table push_tokens enable row level security;

-- Pincode coverage is not sensitive (the catalog already is readable).
create policy "read dealer pincodes" on dealer_pincodes for select using (auth.uid() is not null);

-- A dealer sees only offers made to their own shop.
create policy "dealer reads own assignments" on order_assignments for select using (
  dealer_id in (select id from dealers where profile_id = auth.uid()) or is_admin()
);

-- Each user manages only their own device tokens.
create policy "own push tokens" on push_tokens for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ───────────────────────── grants (auto-expose is OFF) ─────────────────────────
grant select on dealer_pincodes, order_assignments to authenticated;
grant select, insert, update, delete on push_tokens to authenticated;
grant all on dealer_pincodes, order_assignments, push_tokens to service_role;
grant all on sequence order_assignments_id_seq to service_role;

-- Dealers flip their own shop open/closed from the app (RLS "own dealer row"
-- already limits it to their row); hours and prices stay admin/API-only.
grant update (is_open, closed_until) on dealers to authenticated;
create policy "dealer updates own shop state" on dealers for update
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- Dealers flip their own stock switches.
grant update (out_of_stock_until) on dealer_products to authenticated;
create policy "dealer updates own stock" on dealer_products for update
  using (dealer_id in (select id from dealers where profile_id = auth.uid()))
  with check (dealer_id in (select id from dealers where profile_id = auth.uid()));
