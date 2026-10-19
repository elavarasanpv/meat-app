-- Dev seed data (do not run in production)
insert into zones (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Kallakurichi');

insert into zone_pincodes (zone_id, pincode) values
  ('00000000-0000-0000-0000-000000000001', '606202');

insert into categories (id, name, sort) values
  ('00000000-0000-0000-0000-000000000011', 'Chicken', 1),
  ('00000000-0000-0000-0000-000000000012', 'Mutton', 2),
  ('00000000-0000-0000-0000-000000000013', 'Fish', 3),
  ('00000000-0000-0000-0000-000000000014', 'Eggs', 4);

insert into products (category_id, name, base_price_per_kg) values
  ('00000000-0000-0000-0000-000000000011', 'Broiler chicken curry cut', 220),
  ('00000000-0000-0000-0000-000000000011', 'Country chicken (whole)', 320),
  ('00000000-0000-0000-0000-000000000012', 'Goat mutton curry cut', 840),
  ('00000000-0000-0000-0000-000000000012', 'Mutton boneless', 920);

-- Label sticker roll for first dealer (link dealer_id after enrolling one)
insert into labels (code)
select 'LBL-' || lpad(n::text, 6, '0') from generate_series(1, 500) n;
