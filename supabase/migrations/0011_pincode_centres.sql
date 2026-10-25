-- Serviceable pincodes carry a map centre so typing a pincode can jump the
-- address pin there (no paid geocoding), and act as the serviceability check.

alter table zone_pincodes add column if not exists lat double precision;
alter table zone_pincodes add column if not exists lng double precision;
alter table zone_pincodes add column if not exists area text;
comment on column zone_pincodes.lat is 'Approximate centre of the pincode area; the address map opens here.';

update zone_pincodes set lat = 11.7383, lng = 78.9594, area = 'Kallakurichi' where pincode = '606202';

-- Nearby pincodes in the same zone (approximate centres; adjust as you expand)
insert into zone_pincodes (zone_id, pincode, lat, lng, area) values
  ('00000000-0000-0000-0000-000000000001', '606201', 11.7420, 78.9480, 'Kallakurichi town'),
  ('00000000-0000-0000-0000-000000000001', '606213', 11.7900, 78.9000, 'Thiyagadurgam'),
  ('00000000-0000-0000-0000-000000000001', '606206', 11.7130, 78.8950, 'Moongilthuraipattu')
on conflict (zone_id, pincode) do update set lat = excluded.lat, lng = excluded.lng, area = excluded.area;

insert into supabase_migrations.schema_migrations (version, name)
values ('0011', 'pincode_centres') on conflict (version) do nothing;
