-- 0017: rider operations.
--  • Offers are broadcast: every nearby online rider sees a packed order and
--    the first to accept wins (atomic claim on orders.rider_id). rider_offers
--    only logs outcomes — a 'rejected' row hides the order from that rider,
--    'won'/'lost' record who raced for it.
--  • A trip is one ride out from one shop: the orders a rider picks up
--    together, each a stop with its own times, km and cash. The admin app
--    will set rider pay from these logs; orders.rider_fee stays null until then.
--  • delivery_attempts records every failed handover (reason + photo).
--  • rider_shifts logs online time for the admin's daily rider view.

-- ── offers ────────────────────────────────────────────────────────────────
create table rider_offers (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  rider_id uuid not null references delivery_partners(id),
  outcome text not null check (outcome in ('rejected', 'won', 'lost')),
  created_at timestamptz not null default now(),
  unique (order_id, rider_id)
);
create index rider_offers_order_idx on rider_offers(order_id);

-- ── trips ─────────────────────────────────────────────────────────────────
create table trips (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references delivery_partners(id),
  dealer_id uuid not null references dealers(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  total_km numeric(6,2),
  created_at timestamptz not null default now()
);
create index trips_rider_idx on trips(rider_id, started_at desc);

create table trip_stops (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  order_id uuid not null unique references orders(id),
  seq int not null,                  -- planned order (oldest customer first)
  actual_seq int,                    -- order actually delivered in
  reorder_reason text,               -- set when the rider changed the sequence
  arrived_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  returned_at timestamptz,
  leg_km numeric(6,2),
  cash_collected numeric(10,2) not null default 0
);
create index trip_stops_trip_idx on trip_stops(trip_id, seq);

-- ── failed handovers ──────────────────────────────────────────────────────
create table delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  rider_id uuid not null references delivery_partners(id),
  reason text not null check (reason in ('no_answer', 'refused', 'wrong_address', 'other')),
  photo_path text,
  created_at timestamptz not null default now()
);
create index delivery_attempts_order_idx on delivery_attempts(order_id);

-- ── shifts ────────────────────────────────────────────────────────────────
create table rider_shifts (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references delivery_partners(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create index rider_shifts_rider_idx on rider_shifts(rider_id, started_at desc);

-- ── orders: rider pay (admin sets the rule later) ─────────────────────────
alter table orders add column if not exists rider_fee numeric(10,2);

-- ── RLS: riders read their own rows; only the API (service role) writes ───
alter table rider_offers enable row level security;
alter table trips enable row level security;
alter table trip_stops enable row level security;
alter table delivery_attempts enable row level security;
alter table rider_shifts enable row level security;

create policy "rider reads own offers" on rider_offers for select using (
  rider_id in (select id from delivery_partners where profile_id = auth.uid()) or is_admin()
);
create policy "rider reads own trips" on trips for select using (
  rider_id in (select id from delivery_partners where profile_id = auth.uid()) or is_admin()
);
create policy "rider reads own stops" on trip_stops for select using (
  trip_id in (select t.id from trips t join delivery_partners d on d.id = t.rider_id where d.profile_id = auth.uid()) or is_admin()
);
create policy "rider reads own attempts" on delivery_attempts for select using (
  rider_id in (select id from delivery_partners where profile_id = auth.uid()) or is_admin()
);
create policy "rider reads own shifts" on rider_shifts for select using (
  rider_id in (select id from delivery_partners where profile_id = auth.uid()) or is_admin()
);

grant select on rider_offers, trips, trip_stops, delivery_attempts, rider_shifts to authenticated;
-- The API writes these tables with the service role, which has no default grant here.
grant all on rider_offers, trips, trip_stops, delivery_attempts, rider_shifts to service_role;

