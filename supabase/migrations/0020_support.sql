-- 0020: customer support.
--  • tickets (from 0001) grows the fields the support flow needs: a status
--    machine, what the complaint is about, how it was resolved and whose
--    fault it was. source says who raised it (customer / shop / rider / auto).
--  • ticket_messages is the chat thread on a ticket (text + optional photo).
--  • wallet_entries is the customer wallet ledger: credits from support,
--    later minus entries when a credit is used at checkout. Balance = sum.
-- All writes go through the API (service role); users only read their own.

alter table tickets
  add column if not exists source text not null default 'customer'
    check (source in ('customer', 'shop', 'rider', 'auto')),
  add column if not exists order_item_id uuid references order_items(id),
  add column if not exists fault text
    check (fault in ('shop', 'rider', 'freshcut', 'customer', 'none')),
  add column if not exists resolution text
    check (resolution in ('credit', 'refund_upi', 'replacement', 'apology', 'none')),
  add column if not exists credit_amount numeric(10,2),
  add column if not exists resolved_by uuid references profiles(id),
  add column if not exists resolved_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

-- Old rows used free-text status; normalise to the state machine:
-- open → waiting_customer → resolved → closed (resolved/closed are final-ish).
update tickets set status = 'open' where status not in ('open', 'waiting_customer', 'resolved', 'closed');
alter table tickets add constraint tickets_status_check
  check (status in ('open', 'waiting_customer', 'resolved', 'closed'));

comment on column tickets.type is 'missing_item | quality | late | rider_behaviour | charged_wrong | delivery_failed | app_issue | cash_dispute | other';
comment on column tickets.credit_amount is 'Rupees credited to the wallet when resolution = credit';

create trigger tickets_updated_at before update on tickets
  for each row execute function set_updated_at();

create index if not exists tickets_status_idx on tickets(status, updated_at desc);
create index if not exists tickets_customer_idx on tickets(customer_id, created_at desc);

-- ───────────────────────── messages ─────────────────────────
create table ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  sender text not null check (sender in ('customer', 'admin', 'system')),
  sender_id uuid references profiles(id),
  body text,
  photo_path text,                    -- storage path in order-proofs (support/…)
  created_at timestamptz not null default now()
);
create index ticket_messages_ticket_idx on ticket_messages(ticket_id, created_at);

alter table ticket_messages enable row level security;
create policy "own ticket messages" on ticket_messages for select using (
  ticket_id in (select id from tickets where customer_id = auth.uid()) or is_admin()
);
grant select on ticket_messages to authenticated;
grant all on ticket_messages to service_role;

-- ───────────────────────── wallet ─────────────────────────
create table wallet_entries (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references profiles(id),
  amount numeric(10,2) not null,      -- + credit, − spent
  reason text not null,               -- support_credit | order_payment | adjustment
  ticket_id uuid references tickets(id),
  order_id uuid references orders(id),
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index wallet_entries_customer_idx on wallet_entries(customer_id, created_at desc);

alter table wallet_entries enable row level security;
create policy "own wallet" on wallet_entries for select using (customer_id = auth.uid() or is_admin());
grant select on wallet_entries to authenticated;
grant all on wallet_entries to service_role;

grant all on tickets to service_role;
