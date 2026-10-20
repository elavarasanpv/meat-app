-- Explicit Data API privileges.
-- The project is created with "Automatically expose new tables" OFF, so no role
-- can reach a table until it is granted here. RLS still filters which rows.

grant usage on schema public to anon, authenticated, service_role;

-- ───────────── service_role: the NestJS API (bypasses RLS) ─────────────
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- ───────────── anon: not logged in → nothing ─────────────
-- (intentionally no grants)

-- ───────────── authenticated: logged-in app users ─────────────
-- Read access; RLS policies in 0001 decide which rows each user sees.
grant select on
  profiles, zones, zone_pincodes, addresses, dealers, delivery_partners,
  categories, products, dealer_products, delivery_slots,
  orders, order_items, order_status_history, labels, order_proofs,
  payments, cash_submissions, tickets
to authenticated;

-- Profile: only harmless columns are editable, so a user can never
-- change their own role (e.g. promote themselves to admin).
grant update (full_name, lang) on profiles to authenticated;

-- Own addresses (RLS restricts to user_id = auth.uid()).
grant insert, update, delete on addresses to authenticated;

-- Raise a support ticket.
grant insert on tickets to authenticated;

-- Helper functions used inside RLS policies.
grant execute on function is_admin() to authenticated;
grant execute on function current_role_of(uuid) to authenticated;

-- No insert/update/delete on orders and related tables:
-- every order change goes through the API.
