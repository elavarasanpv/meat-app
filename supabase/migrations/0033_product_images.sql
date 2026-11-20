-- 0033: product photos from the admin, descriptions for product pages.
--
-- Photos live in the public `product-images` bucket (0016) and are uploaded
-- through the API, which resizes them to WebP:
--   product-images/<kind>/<id>/main.webp       800 px, product page
--   product-images/<kind>/<id>/main-300.webp   300 px, lists and cart
-- `image_path` on the row points at the 800 px file; the app derives the
-- small one by name. Extra photos (carousel) go in product_images.
--
-- Rollback:
--   drop table if exists product_images;
--   alter table master_products drop column if exists description, drop column if exists description_ta;
--   alter table products drop column if exists description_ta;
--   delete from supabase_migrations.schema_migrations where version = '0033';

alter table master_products
  add column if not exists description    text,
  add column if not exists description_ta text;
alter table products
  add column if not exists description_ta text;   -- `description` exists since 0001

create table if not exists product_images (
  id          uuid primary key default gen_random_uuid(),
  owner_kind  text not null check (owner_kind in ('product', 'master', 'category', 'catalog_category')),
  owner_id    uuid not null,
  path        text not null,                     -- 800 px file; "-300" twin alongside
  sort        int  not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists product_images_owner_idx on product_images (owner_kind, owner_id, sort);
comment on table product_images is 'Extra photos per product/master/category (the main one is image_path on the row)';

alter table product_images enable row level security;
grant select on product_images to authenticated;
grant all on product_images to service_role;
drop policy if exists "read product images" on product_images;
create policy "read product images" on product_images for select using (auth.uid() is not null);

insert into supabase_migrations.schema_migrations (version, name)
values ('0033', 'product_images') on conflict (version) do nothing;
