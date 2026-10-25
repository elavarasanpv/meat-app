-- "Delete" an address = archive it. Past orders still reference it, so rows are never removed.
alter table addresses add column if not exists archived_at timestamptz;
comment on column addresses.archived_at is 'Set when the customer deletes the address; hidden from pickers, kept for order history.';

insert into supabase_migrations.schema_migrations (version, name)
values ('0014', 'address_archive') on conflict (version) do nothing;
