-- Sub-categories: an optional level between category and product.
-- Chicken → Broiler chicken / Country chicken, each with its own products.
-- Categories without sub-categories (mutton, eggs) keep products directly.

create table subcategories (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id) on delete cascade,
  name text not null,
  image_path text,
  sort int not null default 0,
  is_active boolean not null default true
);

comment on table subcategories is 'Optional level between category and product (e.g. Chicken → Broiler / Country). Categories without rows here sell products directly.';

alter table products add column subcategory_id uuid references subcategories(id);
comment on column products.subcategory_id is 'Set when the product belongs to a sub-category; null for direct products.';

alter table subcategories enable row level security;
create policy "read subcategories" on subcategories for select using (auth.uid() is not null);
grant select on subcategories to authenticated;
grant all on subcategories to service_role;

-- ── Chicken sub-categories ──────────────────────────────────────────────
insert into subcategories (id, category_id, name, sort) values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000011', 'Broiler chicken', 1),
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000011', 'Country chicken', 2);

-- Replace the two placeholder chicken products with real ones per sub-category
delete from products where name in ('Broiler chicken curry cut', 'Country chicken (whole)');

insert into products (category_id, subcategory_id, name, base_price_per_kg, unit) values
  -- Broiler chicken
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000021', 'Whole chicken', 180, 'kg'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000021', 'Curry cut', 220, 'kg'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000021', 'Skinless curry cut', 235, 'kg'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000021', 'Breast piece (boneless)', 290, 'kg'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000021', 'Leg piece', 260, 'kg'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000021', 'Wings', 170, 'kg'),
  -- Country chicken
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000022', 'Country cock (whole)', 380, 'kg'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000022', 'Country hen (with skin)', 340, 'kg'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000022', 'Country hen (skinless)', 360, 'kg');

insert into supabase_migrations.schema_migrations (version, name)
values ('0005', 'subcategories') on conflict (version) do nothing;
