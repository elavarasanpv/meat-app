-- Duplicate-order protection. The app sends one id per checkout with every
-- attempt (second tap, automatic retry, retry after a lost reply). The first
-- attempt creates the order(s); any later attempt with the same id gets the
-- same order(s) back instead of a second one.

alter table orders add column if not exists client_request_id uuid;
-- Not unique: one grocery checkout can become several orders (one per shop).
create index if not exists orders_client_request_idx on orders (customer_id, client_request_id) where client_request_id is not null;

create or replace function place_order_once(
  p_request     uuid,       -- null from older app builds: no protection, plain create
  p_vertical    text,       -- 'meat' | 'grocery'
  p_customer    uuid,
  p_address     uuid,
  p_slot_start  timestamptz,
  p_slot_end    timestamptz,
  p_payment     payment_mode,
  p_items       jsonb,
  p_otp_hash    text,
  p_otp         text
) returns table (order_id uuid, display_id text, est_amount numeric, dealer_id uuid, otp text, replayed boolean)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  r record;
begin
  if p_request is not null then
    -- Two copies of the same checkout arriving together run one after the other.
    perform pg_advisory_xact_lock(hashtextextended(p_customer::text || ':' || p_request::text, 0));
    if exists (select 1 from orders o where o.customer_id = p_customer and o.client_request_id = p_request) then
      return query
        select o.id, o.display_id, o.est_amount, o.dealer_id, t.otp, true
          from orders o
          left join order_otps t on t.order_id = o.id
         where o.customer_id = p_customer and o.client_request_id = p_request
         order by o.display_id;
      return;
    end if;
  end if;

  if p_vertical = 'grocery' then
    for r in select * from create_grocery_order(p_customer, p_address, p_slot_start, p_slot_end, p_payment, p_items, p_otp_hash, p_otp) loop
      update orders o set client_request_id = p_request where o.id = r.order_id;
      order_id := r.order_id; display_id := r.display_id; est_amount := r.est_amount; dealer_id := r.dealer_id; otp := p_otp; replayed := false;
      return next;
    end loop;
  else
    for r in select * from create_order(p_customer, p_address, p_slot_start, p_slot_end, p_payment, p_items, p_otp_hash, p_otp) loop
      update orders o set client_request_id = p_request where o.id = r.order_id;
      order_id := r.order_id; display_id := r.display_id; est_amount := r.est_amount; dealer_id := null; otp := p_otp; replayed := false;
      return next;
    end loop;
  end if;
  return;
end;
$$;
revoke all on function place_order_once(uuid, text, uuid, uuid, timestamptz, timestamptz, payment_mode, jsonb, text, text) from public, anon, authenticated;
grant execute on function place_order_once(uuid, text, uuid, uuid, timestamptz, timestamptz, payment_mode, jsonb, text, text) to service_role;
