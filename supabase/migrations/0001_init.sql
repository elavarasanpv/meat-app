-- FreshCut initial schema
-- Clients read via RLS; all order state transitions go through the API (service_role).

create extension if not exists "pgcrypto";

-- ──────────────────────────────── enums ────────────────────────────────
create type user_role as enum ('customer', 'dealer', 'rider', 'admin');

create type order_status as enum (
  'PLACED','DEALER_ASSIGNED','ACCEPTED','PACKING','PACKED','RIDER_ASSIGNED',
  'PICKED_UP','OUT_FOR_DELIVERY','DELIVERED','CANCELLED','DELIVERY_FAILED',
  'RETURNED','REFUNDED'
);

create type payment_mode as enum ('cod', 'upi_on_delivery', 'prepaid_upi');
create type payment_status as enum ('pending', 'captured', 'refunded', 'failed');
create type proof_type as enum ('packed', 'handover', 'failed');

-- ──────────────────────────────── profiles ─────────────────────────────
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'customer',
  full_name text,
  phone text unique,
  lang text not null default 'ta',
  created_at timestamptz not null default now()
);

-- ─────────────────────────────── geography ─────────────────────────────
create table zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true
);

create table zone_pincodes (
  zone_id uuid not null references zones(id) on delete cascade,
  pincode text not null,
  primary key (zone_id, pincode)
);

create table addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  label text not null default 'Home',
  address_text text not null,
  landmark text,
  pincode text not null,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────── partners ──────────────────────────────
create table dealers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references profiles(id),
  shop_name text not null,
  fssai_no text,
  zone_id uuid references zones(id),
  lat double precision,
  lng double precision,
  commission_pct numeric(5,2) not null default 10,
  is_open boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table delivery_partners (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references profiles(id),
  vehicle text,
  zone_id uuid references zones(id),
  is_online boolean not null default false,
  cash_balance numeric(10,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────── catalog ───────────────────────────────
create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,               -- Chicken / Mutton / Fish / Eggs
  sort int not null default 0,
  is_active boolean not null default true
);

create table products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id),
  name text not null,               -- "Country chicken curry cut"
  description text,
  base_price_per_kg numeric(10,2) not null,
  image_path text,
  is_active boolean not null default true
);

create table dealer_products (
  dealer_id uuid not null references dealers(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  price_per_kg numeric(10,2),       -- null = use base price
  available_today boolean not null default true,
  primary key (dealer_id, product_id)
);

-- ──────────────────────────────── orders ───────────────────────────────
create table delivery_slots (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid references zones(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_active boolean not null default true
);

create sequence order_daily_seq;

create table orders (
  id uuid primary key default gen_random_uuid(),
  display_id text not null unique,
  customer_id uuid not null references profiles(id),
  dealer_id uuid references dealers(id),
  rider_id uuid references delivery_partners(id),
  address_id uuid not null references addresses(id),
  slot_id uuid references delivery_slots(id),
  status order_status not null default 'PLACED',
  payment_mode payment_mode not null,
  payment_status payment_status not null default 'pending',
  est_amount numeric(10,2) not null,
  final_amount numeric(10,2),
  otp_hash text,                    -- bcrypt of 4-digit delivery OTP
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orders_customer_idx on orders(customer_id, created_at desc);
create index orders_dealer_idx on orders(dealer_id, status);
create index orders_rider_idx on orders(rider_id, status);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id),
  requested_kg numeric(6,3) not null,
  actual_kg numeric(6,3),
  cut text not null,
  size text,
  skinless boolean,
  unit_price_per_kg numeric(10,2) not null,
  notes text
);

create table order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references orders(id) on delete cascade,
  from_status order_status,
  to_status order_status not null,
  actor_id uuid references profiles(id),
  lat double precision,
  lng double precision,
  note text,
  created_at timestamptz not null default now()
);

create table labels (
  code text primary key,            -- LBL-000418
  dealer_id uuid references dealers(id),
  order_id uuid unique references orders(id),
  linked_at timestamptz
);

create table order_proofs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  type proof_type not null,
  photo_path text not null,         -- storage path in order-proofs bucket
  weight_kg numeric(6,3),
  lat double precision,
  lng double precision,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  method text not null,             -- cash | upi_qr | prepaid
  gateway_ref text,
  amount numeric(10,2) not null,
  status payment_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table cash_submissions (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references delivery_partners(id),
  business_date date not null,
  expected numeric(10,2) not null,
  submitted numeric(10,2),
  verified_by uuid references profiles(id),
  mismatch_note text,
  created_at timestamptz not null default now(),
  unique (rider_id, business_date)
);

create table tickets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id),
  customer_id uuid not null references profiles(id),
  type text not null,
  status text not null default 'open',
  assigned_admin uuid references profiles(id),
  body text,
  created_at timestamptz not null default now()
);

-- ──────────────────────────── updated_at trigger ───────────────────────
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end $$ language plpgsql;

create trigger orders_updated_at before update on orders
  for each row execute function set_updated_at();

-- ─────────────────────────── helper functions ──────────────────────────
create or replace function current_role_of(uid uuid) returns user_role
language sql stable security definer as
$$ select role from profiles where id = uid $$;

create or replace function is_admin() returns boolean
language sql stable security definer as
$$ select exists (select 1 from profiles where id = auth.uid() and role = 'admin') $$;

-- ──────────────────────────────── RLS ──────────────────────────────────
alter table profiles enable row level security;
alter table zones enable row level security;
alter table zone_pincodes enable row level security;
alter table addresses enable row level security;
alter table dealers enable row level security;
alter table delivery_partners enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table dealer_products enable row level security;
alter table delivery_slots enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table order_status_history enable row level security;
alter table labels enable row level security;
alter table order_proofs enable row level security;
alter table payments enable row level security;
alter table cash_submissions enable row level security;
alter table tickets enable row level security;

-- profiles: user sees/edits own row; admins see all
create policy "own profile" on profiles
  for select using (id = auth.uid() or is_admin());
create policy "update own profile" on profiles
  for update using (id = auth.uid());

-- catalog & zones: readable by any signed-in user
create policy "read zones" on zones for select using (auth.uid() is not null);
create policy "read zone_pincodes" on zone_pincodes for select using (auth.uid() is not null);
create policy "read categories" on categories for select using (auth.uid() is not null);
create policy "read products" on products for select using (auth.uid() is not null);
create policy "read dealer_products" on dealer_products for select using (auth.uid() is not null);
create policy "read slots" on delivery_slots for select using (auth.uid() is not null);

-- addresses: owner only (admins via API/service role)
create policy "own addresses" on addresses
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- dealers / riders can read their own partner row; admins all
create policy "own dealer row" on dealers
  for select using (profile_id = auth.uid() or is_admin());
create policy "own rider row" on delivery_partners
  for select using (profile_id = auth.uid() or is_admin());

-- orders: customer sees own; dealer sees assigned; rider sees assigned; admin all.
-- No insert/update policies: writes happen only through the API (service_role bypasses RLS).
create policy "read own orders" on orders for select using (
  customer_id = auth.uid()
  or dealer_id in (select id from dealers where profile_id = auth.uid())
  or rider_id in (select id from delivery_partners where profile_id = auth.uid())
  or is_admin()
);

create policy "read own order items" on order_items for select using (
  order_id in (select id from orders)   -- delegates to orders RLS
);
create policy "read own order history" on order_status_history for select using (
  order_id in (select id from orders)
);
create policy "read own order proofs" on order_proofs for select using (
  order_id in (select id from orders)
);
create policy "read own payments" on payments for select using (
  order_id in (select id from orders)
);

-- labels: dealers see their stock
create policy "dealer labels" on labels for select using (
  dealer_id in (select id from dealers where profile_id = auth.uid()) or is_admin()
);

-- cash submissions: rider sees own; admin all
create policy "own cash" on cash_submissions for select using (
  rider_id in (select id from delivery_partners where profile_id = auth.uid()) or is_admin()
);

-- tickets: customer sees own; admin all
create policy "own tickets" on tickets for select using (
  customer_id = auth.uid() or is_admin()
);
create policy "create ticket" on tickets for insert with check (customer_id = auth.uid());
