-- Remove the Kallakurichi dev zone so only the real service area (Chettikulam zone) is serviceable.
-- Test orders/addresses keep their coordinates; only the serviceability list changes.

delete from zone_pincodes where zone_id = '00000000-0000-0000-0000-000000000001';

-- Detach anything pointing at the test zone before deleting it
update dealers           set zone_id = '00000000-0000-0000-0000-000000000002' where zone_id = '00000000-0000-0000-0000-000000000001';
update delivery_partners set zone_id = '00000000-0000-0000-0000-000000000002' where zone_id = '00000000-0000-0000-0000-000000000001';
update delivery_slots    set zone_id = null where zone_id = '00000000-0000-0000-0000-000000000001';

delete from zones where id = '00000000-0000-0000-0000-000000000001';

insert into supabase_migrations.schema_migrations (version, name)
values ('0013', 'remove_test_zone') on conflict (version) do nothing;
