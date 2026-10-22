-- Live rider tracking.
-- One row per rider, updated in place by the API (POST /rider/location).
-- Customers can read it only while that rider is carrying their order.

create table if not exists rider_locations (
  rider_id   uuid primary key references delivery_partners(id) on delete cascade,
  lat        double precision not null,
  lng        double precision not null,
  heading    real,
  speed_kmh  real,
  updated_at timestamptz not null default now()
);
comment on table rider_locations is 'Latest known position of each rider (updated ~every 45 s during a trip). Customers see it only for their active order.';

alter table rider_locations enable row level security;

drop policy if exists "read rider location" on rider_locations;
create policy "read rider location" on rider_locations for select using (
  rider_id in (select id from delivery_partners where profile_id = auth.uid())
  or is_admin()
  or exists (
    select 1 from orders o
    where o.rider_id = rider_locations.rider_id
      and o.customer_id = auth.uid()
      and o.status in ('RIDER_ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY')
  )
);

grant select on rider_locations to authenticated;
grant all on rider_locations to service_role;

-- Where the rider picked the parcel up: the start of the progress bar.
alter table orders add column if not exists pickup_lat double precision;
alter table orders add column if not exists pickup_lng double precision;
comment on column orders.pickup_lat is 'Rider GPS when the order was picked up (start of the tracking bar).';

-- Realtime: push rider position and order status changes to the customer app.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'rider_locations') then
    alter publication supabase_realtime add table rider_locations;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'orders') then
    alter publication supabase_realtime add table orders;
  end if;
end $$;

insert into supabase_migrations.schema_migrations (version, name)
values ('0009', 'rider_tracking') on conflict (version) do nothing;
