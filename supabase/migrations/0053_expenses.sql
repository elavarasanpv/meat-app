-- 0053: money Thanjoz Mart spends outside orders (rider pay, marketing, fuel,
-- staff, packaging, rent …). The admin P&L subtracts it from the order profit.
-- Only the API (service role) reads and writes it.

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  spent_on date not null,
  category text not null check (category in ('rider_pay', 'marketing', 'fuel', 'staff', 'packaging', 'rent', 'tech', 'other')),
  amount numeric(10,2) not null check (amount > 0),
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists expenses_spent_on_idx on expenses(spent_on desc);
comment on table expenses is 'Spending outside orders, entered by the admin; used in the P&L';
alter table expenses enable row level security;
grant all on expenses to service_role;

insert into supabase_migrations.schema_migrations (version, name)
values ('0053', 'expenses') on conflict (version) do nothing;
