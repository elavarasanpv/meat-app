-- 0042 — remind the shop when a "for later" order's slot is near
--
-- A meat order for a later slot (tomorrow morning, this evening) is accepted
-- for that slot, with no "ready in 30 min" promise. prep_remind_at is when the
-- shop is rung to start preparing (an hour before the slot starts); the API
-- sweeper sends the alert and clears the column.
--
-- Rollback:
--   drop index if exists orders_prep_remind_idx;
--   alter table orders drop column if exists prep_remind_at;
--   delete from supabase_migrations.schema_migrations where version = '0042';

alter table orders add column if not exists prep_remind_at timestamptz;
comment on column orders.prep_remind_at is 'When to remind the shop to prepare a for-later order; null once reminded or not needed';
create index if not exists orders_prep_remind_idx on orders (prep_remind_at) where prep_remind_at is not null;

insert into supabase_migrations.schema_migrations (version, name)
values ('0042', 'prep_reminder') on conflict (version) do nothing;
