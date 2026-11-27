-- 0044 — more than one cash hand-over a day
--
-- A rider can hand over cash more than once a day. With one row per rider
-- per day, a second hand-over overwrote the first and kept the admin's
-- "counted" mark, so new cash showed as matched without being counted.
-- Now each hand-over is its own row; the API adds to a row only while it is
-- still waiting to be counted.
--
-- Rollback (only if no rider has two rows on one day):
--   alter table cash_submissions add constraint cash_submissions_rider_id_business_date_key unique (rider_id, business_date);
--   delete from supabase_migrations.schema_migrations where version = '0044';

alter table cash_submissions drop constraint if exists cash_submissions_rider_id_business_date_key;
create index if not exists cash_submissions_rider_idx on cash_submissions (rider_id, business_date desc);

insert into supabase_migrations.schema_migrations (version, name) values ('0044', 'cash_handovers')
  on conflict (version) do nothing;
