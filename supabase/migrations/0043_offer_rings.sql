-- 0043 — an offer stays with the shop until it answers
--
-- With only a few shops, taking an order away after 5 minutes lost orders. A
-- meat offer now stays open: after 5 minutes the other shops that can serve it
-- see it too, and every waiting shop is rung again. last_rung_at is when the
-- shop was last rung again, so the sweeper rings once every few minutes.
--
-- Rollback:
--   alter table order_assignments drop column if exists last_rung_at;
--   delete from supabase_migrations.schema_migrations where version = '0043';

alter table order_assignments add column if not exists last_rung_at timestamptz;
comment on column order_assignments.last_rung_at is 'When the shop was last rung again about this still-open offer';

insert into supabase_migrations.schema_migrations (version, name)
values ('0043', 'offer_rings') on conflict (version) do nothing;
