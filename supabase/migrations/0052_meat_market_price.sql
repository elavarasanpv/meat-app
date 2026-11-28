-- 0052: meat pricing, admin controlled.
--  • dealer_products.market_price: what the shop sells the meat for over its
--    own counter today (the live market price). The shop keeps it current
--    from the partner app; the admin sees it next to the cost and can fix it.
--    It never changes what a customer pays or what we owe the shop.
--  • products.was_price: the price before a discount. When it is above the
--    selling price the customer app shows it struck through.
--  • Cost prices are no longer readable by every signed-in user: a shop reads
--    only its own rows. Customers get availability through meat_catalog().

alter table dealer_products
  add column if not exists market_price numeric(10,2) check (market_price > 0),
  add column if not exists market_price_at timestamptz;
comment on column dealer_products.market_price is 'Live market (counter) price per kg/piece at this shop; set by the shop or the admin. Information only.';

alter table products
  add column if not exists was_price numeric(10,2) check (was_price > 0);
comment on column products.was_price is 'Price before discount; shown struck through when above the selling price';

alter table price_history drop constraint if exists price_history_kind_check;
alter table price_history add constraint price_history_kind_check check (kind in ('sell', 'shop', 'market'));

drop policy if exists "read dealer_products" on dealer_products;
create policy "dealer reads own products" on dealer_products for select
  using (dealer_id in (select id from dealers where profile_id = auth.uid()));

insert into supabase_migrations.schema_migrations (version, name)
values ('0052', 'meat_market_price') on conflict (version) do nothing;
