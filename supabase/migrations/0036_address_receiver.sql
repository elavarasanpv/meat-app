-- Ordering for someone else (a parent, a relative): the address can name who will
-- receive the delivery. Empty = the customer receives it themself. The rider calls
-- the receiver first and still sees who placed the order.
alter table addresses add column if not exists receiver_name text;
alter table addresses add column if not exists receiver_phone text;

alter table addresses drop constraint if exists addresses_receiver_check;
alter table addresses add constraint addresses_receiver_check check (
  (receiver_name is null and receiver_phone is null)
  or (length(btrim(receiver_name)) between 1 and 60 and receiver_phone ~ '^91[6-9][0-9]{9}$')
);

comment on column addresses.receiver_name is 'Who receives the delivery when it is not the customer. Null = the customer.';
comment on column addresses.receiver_phone is 'Receiver mobile as 91XXXXXXXXXX (same shape as profiles.phone). Null = the customer.';

insert into supabase_migrations.schema_migrations (version, name)
values ('0036', 'address_receiver') on conflict (version) do nothing;
