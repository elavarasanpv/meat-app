-- 0018: rider GPS trail + doorstep photos.
--  • rider_location_points keeps every fix the rider app sends (batched, and
--    buffered on the phone while offline), so a trip's km comes from the road
--    actually ridden instead of straight lines between stops. rider_locations
--    still holds only the latest point for live tracking.
--  • Riders may upload a doorstep photo for orders they are carrying, into
--    order-proofs/<order_id>/…, and view their orders' proofs.

create table rider_location_points (
  id bigserial primary key,
  rider_id uuid not null references delivery_partners(id),
  trip_id uuid references trips(id) on delete set null,
  lat double precision not null,
  lng double precision not null,
  speed_kmh real,
  recorded_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index rider_location_points_trip_idx on rider_location_points(trip_id, recorded_at);
create index rider_location_points_rider_idx on rider_location_points(rider_id, recorded_at desc);

alter table rider_location_points enable row level security;
create policy "rider reads own points" on rider_location_points for select using (
  rider_id in (select id from delivery_partners where profile_id = auth.uid()) or is_admin()
);
grant select on rider_location_points to authenticated;
grant all on rider_location_points to service_role;
grant usage, select on sequence rider_location_points_id_seq to service_role;

-- Doorstep photo on a failed delivery: the rider carrying the order may upload.
create policy "rider uploads proof for carried order" on storage.objects for insert to authenticated
with check (
  bucket_id = 'order-proofs'
  and (storage.foldername(name))[1]::uuid in (
    select o.id from orders o join delivery_partners d on d.id = o.rider_id where d.profile_id = auth.uid()
  )
);
create policy "rider views proofs of carried order" on storage.objects for select to authenticated
using (
  bucket_id = 'order-proofs'
  and (storage.foldername(name))[1]::uuid in (
    select o.id from orders o join delivery_partners d on d.id = o.rider_id where d.profile_id = auth.uid()
  )
);
