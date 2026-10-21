-- Products sold by piece (eggs) instead of by weight.
-- unit: 'kg' (price per kg, ordered by weight) or 'piece' (price per piece, ordered by count).

alter table products add column if not exists unit text not null default 'kg'
  check (unit in ('kg', 'piece'));

comment on column products.unit is 'kg = priced per kg and ordered by weight; piece = priced per piece and ordered by count (eggs).';

insert into products (category_id, name, base_price_per_kg, unit) values
  ('00000000-0000-0000-0000-000000000014', 'Farm eggs (white)', 7, 'piece'),
  ('00000000-0000-0000-0000-000000000014', 'Country chicken eggs', 14, 'piece');

insert into supabase_migrations.schema_migrations (version, name)
values ('0004', 'product_unit_eggs') on conflict (version) do nothing;
