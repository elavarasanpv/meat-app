-- 0035: margin-based selling price.
-- A product can carry a margin % instead of a hand-set selling price: the
-- default selling price (products.base_price_per_kg) is then recomputed by
-- the API every time a shop's cost changes, as the highest shop cost plus the
-- margin, rounded up to the rupee. null = fixed price, set by hand as before.

alter table products
  add column margin_pct numeric(5,2) check (margin_pct > 0 and margin_pct <= 500);
comment on column products.margin_pct is 'Selling price = highest shop cost × (1 + margin_pct/100), kept by the API on every cost change; null = fixed selling price';

insert into supabase_migrations.schema_migrations (version, name)
values ('0035', 'margin_pricing') on conflict (version) do nothing;
