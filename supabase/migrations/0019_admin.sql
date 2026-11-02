-- 0019: admin access for the web admin app.
--  • admin_emails is the allowlist: only these emails can sign in to the
--    admin app. The API checks it on every /admin request, and the signup
--    trigger gives a matching new user the admin role (so existing is_admin()
--    read policies work for them).
--  • admin_actions is the audit log: every change an admin makes, with who,
--    what and when. Written only by the API.

create table admin_emails (
  email text primary key check (email = lower(email)),
  note text,                          -- who this is, e.g. "Elavarasan — owner"
  created_at timestamptz not null default now()
);
-- The allowlist itself stays private to the API.
grant all on admin_emails to service_role;

create table admin_actions (
  id bigserial primary key,
  admin_id uuid not null references profiles(id),
  action text not null,               -- e.g. "dealer.create", "order.reassign"
  target text,                        -- the affected id (order, dealer, rider…)
  detail jsonb,                       -- the change itself
  created_at timestamptz not null default now()
);
create index admin_actions_time_idx on admin_actions(created_at desc);

alter table admin_actions enable row level security;
create policy "admins read audit log" on admin_actions for select using (is_admin());
grant select on admin_actions to authenticated;
grant all on admin_actions to service_role;
grant usage, select on sequence admin_actions_id_seq to service_role;

-- New auth users whose email is on the allowlist become admins immediately.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, phone, role)
  values (
    new.id,
    new.phone,
    case when new.email is not null and exists (select 1 from public.admin_emails where email = lower(new.email))
      then 'admin'::user_role else 'customer'::user_role end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
