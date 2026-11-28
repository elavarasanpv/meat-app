-- 0056: P&L by meat and grocery.
--  • order_items.market_unit_price: the shop's own counter (market) price when
--    it accepted a meat order, so "customer saved ₹x against the market" is
--    fixed per order like the shop cost is. Information only: profit never uses it.
--  • expenses.vertical: spending for meat only, grocery only, or (null) shared.
--
-- Rollback:
--   alter table order_items drop column market_unit_price;
--   alter table expenses drop column vertical;

alter table order_items add column if not exists market_unit_price numeric(10,2);
comment on column order_items.market_unit_price is 'Meat: the shop''s market (counter) price per kg/piece when it accepted the order. Reference only.';

alter table expenses add column if not exists vertical text check (vertical in ('meat', 'grocery'));
comment on column expenses.vertical is 'Spending for meat or grocery only; null = shared by both';

insert into supabase_migrations.schema_migrations (version, name)
values ('0056', 'pnl_market_and_vertical') on conflict (version) do nothing;
