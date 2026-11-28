-- 0054: automatic customer notifications.
--
-- Three kinds, each switched on and worded by the admin:
--   salary_day : once a month, on day_of_month (the last day when the month is shorter)
--   weekend    : once a week, on weekday (0 = Sunday … 6 = Saturday)
--   inactive   : every day, to customers whose last order is older than
--                inactive_days; each customer gets it once per quiet spell
--                (again only after they order and go quiet again)
-- All are sent at send_at, Indian time. Every row starts switched off.
--
-- Rollback:
--   drop function if exists auto_push_audience(text, text[], int);
--   drop table if exists auto_push_log; drop table if exists auto_pushes;

create table if not exists auto_pushes (
  kind            text primary key check (kind in ('salary_day', 'weekend', 'inactive')),
  enabled         boolean not null default false,
  title           text not null,
  body            text not null,
  title_ta        text,
  body_ta         text,
  send_at         time not null default '10:00',
  day_of_month    int not null default 1 check (day_of_month between 1 and 31),
  weekday         int not null default 6 check (weekday between 0 and 6),
  inactive_days   int not null default 7 check (inactive_days between 2 and 90),
  audience        text not null default 'all' check (audience in ('all', 'ordered', 'never_ordered')),
  pincodes        text[] not null default '{}',
  last_run_on     date,          -- Indian date of the last send, so a day never gets two
  last_sent_at    timestamptz,
  last_sent_count int,
  updated_at      timestamptz not null default now()
);
drop trigger if exists auto_pushes_updated_at on auto_pushes;
create trigger auto_pushes_updated_at before update on auto_pushes for each row execute function set_updated_at();
alter table auto_pushes enable row level security;   -- through the API only
grant all on auto_pushes to service_role;

insert into auto_pushes (kind, title, body, title_ta, body_ta, send_at, audience) values
  ('salary_day', 'Happy Salary Day! 🎉', 'Treat yourself today. Order your favourite products from Thanjoz Mart.',
   'சம்பள நாள் வாழ்த்துகள்! 🎉', 'இன்று உங்களுக்கே ஒரு விருந்து. உங்களுக்குப் பிடித்த பொருட்களை Thanjoz Mart-ல் ஆர்டர் செய்யுங்கள்.', '10:00', 'all'),
  ('weekend', 'Happy Weekend! 🛍️', 'Enjoy your weekend with your favourite products from Thanjoz Mart.',
   'இனிய வார இறுதி! 🛍️', 'உங்களுக்குப் பிடித்த பொருட்களுடன் வார இறுதியைக் கொண்டாடுங்கள். Thanjoz Mart-ல் ஆர்டர் செய்யுங்கள்.', '09:00', 'all'),
  ('inactive', 'We miss you! ❤️', 'It''s been a week since your last order. Come back and order your favourites from Thanjoz Mart.',
   'உங்களை மிஸ் செய்கிறோம்! ❤️', 'உங்கள் கடைசி ஆர்டருக்குப் பிறகு ஒரு வாரம் ஆகிவிட்டது. மீண்டும் வந்து Thanjoz Mart-ல் ஆர்டர் செய்யுங்கள்.', '11:00', 'ordered')
on conflict (kind) do nothing;

-- Who got an "inactive" push, so nobody gets it twice for the same quiet spell.
create table if not exists auto_push_log (
  id          bigint generated always as identity primary key,
  kind        text not null,
  customer_id uuid not null references profiles(id) on delete cascade,
  sent_at     timestamptz not null default now()
);
create index if not exists auto_push_log_idx on auto_push_log (kind, customer_id, sent_at desc);
alter table auto_push_log enable row level security;
grant all on auto_push_log to service_role;
grant usage on sequence auto_push_log_id_seq to service_role;

-- Customers (with the app installed) a push should reach.
--   p_pincodes empty   : everywhere; otherwise a saved address in one of them
--   p_inactive_days set: last order older than that, not yet told since it
create or replace function auto_push_audience(p_audience text, p_pincodes text[], p_inactive_days int)
returns table (user_id uuid)
language sql stable security definer set search_path = public as $$
  with c as (
    select p.id from profiles p
     where p.role = 'customer'
       and exists (select 1 from push_tokens t where t.profile_id = p.id)
       and (coalesce(cardinality(p_pincodes), 0) = 0
            or exists (select 1 from addresses a where a.user_id = p.id and a.archived_at is null and a.pincode = any (p_pincodes)))
  ), last as (
    select o.customer_id, max(o.created_at) as at
      from orders o join c on c.id = o.customer_id
     where o.status <> 'CANCELLED'
     group by o.customer_id
  )
  select c.id from c left join last l on l.customer_id = c.id
   where case
     when p_inactive_days is not null then
       l.at is not null and l.at < now() - make_interval(days => p_inactive_days)
       and not exists (select 1 from auto_push_log g where g.kind = 'inactive' and g.customer_id = c.id and g.sent_at > l.at)
     when p_audience = 'ordered' then l.at is not null
     when p_audience = 'never_ordered' then l.at is null
     else true
   end;
$$;
revoke all on function auto_push_audience(text, text[], int) from public, anon, authenticated;
grant execute on function auto_push_audience(text, text[], int) to service_role;
