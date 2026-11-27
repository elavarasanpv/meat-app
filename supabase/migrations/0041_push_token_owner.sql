-- 0041 — a phone's alerts go only to the account signed in on it
--
-- push_tokens is keyed (profile_id, token), so one phone could stay listed
-- under an account that left it without a clean sign-out (session expired,
-- app data cleared, signed out from another device). That phone kept getting
-- the old account's alerts: a shop phone rang for rider jobs, and the rider's
-- own phone looked like it "missed" them. claim_push_token() moves the phone
-- to the account signed in now, dropping it from every other account.
--
-- Rollback:
--   drop function if exists claim_push_token(text, text);
--   delete from supabase_migrations.schema_migrations where version = '0041';

create or replace function claim_push_token(p_token text, p_platform text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  delete from push_tokens where token = p_token and profile_id <> auth.uid();
  insert into push_tokens (profile_id, token, platform, updated_at)
  values (auth.uid(), p_token, p_platform, now())
  on conflict (profile_id, token) do update set platform = excluded.platform, updated_at = now();
end;
$$;
revoke all on function claim_push_token(text, text) from public, anon;
grant execute on function claim_push_token(text, text) to authenticated;

insert into supabase_migrations.schema_migrations (version, name)
values ('0041', 'push_token_owner') on conflict (version) do nothing;
