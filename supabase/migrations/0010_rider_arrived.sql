-- "Rider arrived" moment: set when the rider taps Arrived at the door.
-- Kept as a timestamp (not a new status) so the order state machine is unchanged;
-- the customer app shows the arrival screen while status is OUT_FOR_DELIVERY and arrived_at is set.

alter table orders add column if not exists arrived_at timestamptz;
comment on column orders.arrived_at is 'When the rider tapped "Arrived" at the customer''s door (status stays OUT_FOR_DELIVERY until the OTP handover).';

insert into supabase_migrations.schema_migrations (version, name)
values ('0010', 'rider_arrived') on conflict (version) do nothing;
