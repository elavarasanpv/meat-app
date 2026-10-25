-- Primary service area: Chettikulam / Kudankulam / Anjugramam
-- (Radhapuram taluk, Tirunelveli district, and Kanyakumari district).
-- Centres are approximate town centres; nudge them from the admin later.

insert into zones (id, name) values
  ('00000000-0000-0000-0000-000000000002', 'Chettikulam')
on conflict (id) do nothing;

insert into zone_pincodes (zone_id, pincode, lat, lng, area) values
  ('00000000-0000-0000-0000-000000000002', '627120', 8.2426, 77.6759, 'Chettikulam'),
  ('00000000-0000-0000-0000-000000000002', '627106', 8.1762, 77.7116, 'Kudankulam'),
  ('00000000-0000-0000-0000-000000000002', '629401', 8.1333, 77.5833, 'Anjugramam')
on conflict (zone_id, pincode) do update set lat = excluded.lat, lng = excluded.lng, area = excluded.area;

insert into supabase_migrations.schema_migrations (version, name)
values ('0012', 'chettikulam_zone') on conflict (version) do nothing;
