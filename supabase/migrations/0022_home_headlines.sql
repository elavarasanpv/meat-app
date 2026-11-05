-- 0022: home headline — the title above the "For you" carousel.
-- The app rotates a catchy line per weekday by itself; an admin can override
-- it for a date range ("New Year special 🎉", "Bakrid mutton week").
-- The newest active headline whose window covers now wins.

create table home_headlines (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 60),
  title_ta text check (title_ta is null or char_length(title_ta) <= 80),
  subtitle text check (subtitle is null or char_length(subtitle) <= 80),
  subtitle_ta text check (subtitle_ta is null or char_length(subtitle_ta) <= 100),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_active boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index home_headlines_live_idx on home_headlines (starts_at, ends_at) where is_active;

alter table home_headlines enable row level security;
create policy "live headlines" on home_headlines for select using (
  is_admin() or (is_active and starts_at <= now() and ends_at > now())
);
grant select on home_headlines to authenticated;
grant all on home_headlines to service_role;
