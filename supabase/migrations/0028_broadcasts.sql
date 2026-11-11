-- 0028: promo pushes sent from the admin ("Sunday special", new offers):
-- who they went to and how many phones got them. Written by the API only.

create table broadcasts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  title_ta text,
  body_ta text,
  audience text not null check (audience in ('customers', 'shops', 'riders', 'all')),
  offer_id uuid references offers(id) on delete set null,  -- tap opens this offer
  sent int not null default 0,
  failed int not null default 0,
  sent_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
alter table broadcasts enable row level security;
grant all on broadcasts to service_role;

insert into supabase_migrations.schema_migrations (version, name)
values ('0028', 'broadcasts') on conflict (version) do nothing;
