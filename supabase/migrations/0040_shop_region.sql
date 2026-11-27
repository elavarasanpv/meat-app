-- 0040 — one region rule for what a customer sees and can order
--
-- A shop serves an address when the address pincode is on the shop's service
-- list (dealer_pincodes) OR the shop's pin is within 5 km of the address pin.
-- Before this the meat list showed every product everywhere, and grocery
-- matched on pincode only.
--
--   • dealer_serves()      the rule, used by everything below
--   • meat_catalog()       new: the meat products shops in the region list
--   • grocery_catalog()    now also takes the address pin (older app builds
--                          that send only the pincode keep working)
--   • create_order()       refuses an item no shop in the region lists
--   • create_grocery_order() picks shops with the same rule
--
-- Rollback:
--   (re-run the grocery_catalog block of 0038 after dropping the 3-argument one,
--    and the create_order / create_grocery_order blocks of 0037)
--   drop function if exists meat_catalog(text, double precision, double precision);
--   drop function if exists dealer_serves(uuid, text, double precision, double precision);
--   drop function if exists km_between(double precision, double precision, double precision, double precision);
--   drop function if exists shop_region_km();
--   delete from supabase_migrations.schema_migrations where version = '0040';

-- ───────────────────────── the rule ─────────────────────────
-- Same number as SHOP_REGION_KM in packages/shared/src/constants.ts.
create or replace function shop_region_km() returns numeric
language sql immutable as $$ select 5::numeric $$;

-- Straight-line distance in km (haversine).
create or replace function km_between(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql immutable as $$
  select 2 * 6371 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )))
$$;

create or replace function dealer_serves(p_dealer uuid, p_pincode text, p_lat double precision, p_lng double precision)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from dealer_pincodes dp where dp.dealer_id = p_dealer and dp.pincode = p_pincode)
      or exists (
        select 1 from dealers d
         where d.id = p_dealer and d.lat is not null and d.lng is not null
           and p_lat is not null and p_lng is not null
           and km_between(d.lat, d.lng, p_lat, p_lng) <= shop_region_km()
      )
$$;
revoke all on function dealer_serves(uuid, text, double precision, double precision) from public, anon, authenticated;
grant execute on function dealer_serves(uuid, text, double precision, double precision) to service_role;

-- ───────────────────────── meat list for an address ─────────────────────────
-- Products that an active meat shop serving the address lists. in_stock is
-- true when one of those shops is open and has it right now.
create or replace function meat_catalog(p_pincode text, p_lat double precision default null, p_lng double precision default null)
returns table (product_id uuid, in_stock boolean)
language sql stable security definer set search_path = public as $$
  select dp.product_id,
         bool_or(d.is_open and (d.closed_until is null or d.closed_until <= now())
                 and (dp.out_of_stock_until is null or dp.out_of_stock_until <= now()))
    from dealer_products dp
    join dealers d on d.id = dp.dealer_id
   where d.is_active and d.store_type = 'meat'
     and dealer_serves(d.id, p_pincode, p_lat, p_lng)
   group by dp.product_id
$$;
revoke all on function meat_catalog(text, double precision, double precision) from public, anon;
grant execute on function meat_catalog(text, double precision, double precision) to authenticated, service_role;

-- ───────────────────────── grocery list for an address ─────────────────────────
-- The argument list grows, so the function is dropped and made again.
drop function if exists grocery_catalog(text);
drop function if exists grocery_catalog(text, double precision, double precision);
create function grocery_catalog(p_pincode text, p_lat double precision default null, p_lng double precision default null)
returns table (
  master_product_id uuid, name text, name_ta text, brand text, pack_size text,
  unit text, min_qty numeric, qty_step numeric, image_path text, category_id uuid,
  selling_price numeric, mrp numeric, in_stock boolean, shops bigint, card_bg text
)
language sql stable security definer set search_path = public as $$
  with live as (
    select sp.master_product_id, sp.selling_price, sp.mrp,
           (sp.out_of_stock_until is null or sp.out_of_stock_until <= now()) as ok
      from store_products sp
      join dealers d on d.id = sp.dealer_id
     where sp.is_active and d.is_active and d.store_type = 'grocery'
       and d.is_open and (d.closed_until is null or d.closed_until <= now())
       and vertical_is_active('grocery')
       and dealer_serves(d.id, p_pincode, p_lat, p_lng)
  ),
  best as (
    select l.master_product_id,
           coalesce(min(l.selling_price) filter (where l.ok), min(l.selling_price)) as selling_price,
           bool_or(l.ok) as in_stock,
           count(*) as shops,
           max(l.mrp) as mrp
      from live l group by l.master_product_id
  )
  select m.id, m.name, m.name_ta, m.brand, m.pack_size, m.unit, m.min_qty, m.qty_step, m.image_path, m.category_id,
         b.selling_price, coalesce(m.mrp, b.mrp), b.in_stock, b.shops, m.card_bg
    from best b
    join master_products m on m.id = b.master_product_id
   where m.is_active and m.status <> 'rejected'
   order by m.name
$$;
revoke all on function grocery_catalog(text, double precision, double precision) from public, anon;
grant execute on function grocery_catalog(text, double precision, double precision) to authenticated, service_role;

-- ───────────────────────── create_order: items must be sold in the region ─────────────────────────
create or replace function create_order(
  p_customer    uuid,
  p_address     uuid,
  p_slot_start  timestamptz,
  p_slot_end    timestamptz,
  p_payment     payment_mode,
  p_items       jsonb,
  p_otp_hash    text,
  p_otp         text
) returns table (order_id uuid, display_id text, est_amount numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id   uuid;
  v_display    text;
  v_slot_id    uuid;
  v_items      numeric := 0;
  v_delivery   numeric;
  v_item       jsonb;
  v_product    products%rowtype;
  v_qty        numeric;
  v_pincode    text;
  v_sell       numeric;
  v_q          record;
  v_lat        double precision;
  v_lng        double precision;
begin
  select pincode, lat, lng into v_pincode, v_lat, v_lng from addresses where id = p_address and user_id = p_customer;
  if v_pincode is null then
    raise exception 'address not found' using errcode = 'P0002';
  end if;
  if p_slot_start <= now() then
    raise exception 'slot is in the past' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'no items' using errcode = 'P0001';
  end if;

  insert into delivery_slots (zone_id, starts_at, ends_at)
  values (null, p_slot_start, p_slot_end)
  on conflict (zone_id, starts_at) do update set ends_at = excluded.ends_at
  returning id into v_slot_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from products where id = (v_item->>'product_id')::uuid and is_active;
    if not found then
      raise exception 'product % not available', v_item->>'product_id' using errcode = 'P0002';
    end if;
    -- Region rule: some active meat shop serving this address must list the item.
    if not exists (
      select 1 from dealer_products dp
        join dealers d on d.id = dp.dealer_id
       where dp.product_id = v_product.id and d.is_active and d.store_type = 'meat'
         and dealer_serves(d.id, v_pincode, v_lat, v_lng)
    ) then
      raise exception '% is not delivered to this address', v_product.name using errcode = 'FC409';
    end if;
    v_qty := (v_item->>'qty')::numeric;
    if v_qty <= 0 or v_qty > 50 then
      raise exception 'bad quantity' using errcode = 'P0001';
    end if;
    select price_per_kg into v_sell from product_prices where product_id = v_product.id and pincode = v_pincode;
    v_items := v_items + round(coalesce(v_sell, v_product.base_price_per_kg) * v_qty);
  end loop;
  -- Delivery terms come from the admin's rules (pincode rule, else the default).
  select * into v_q from delivery_charge('meat', v_pincode, v_items, is_first_order(p_customer));
  if v_q.below_min then
    raise exception 'Minimum order is ₹%', v_q.min_order::int using errcode = 'P0001';
  end if;
  v_delivery := v_q.charge;

  v_display := 'MT-' || to_char(now() at time zone 'Asia/Kolkata', 'MMDD') || '-' || lpad(nextval('order_daily_seq')::text, 4, '0');

  insert into orders (display_id, customer_id, address_id, slot_id, status, payment_mode, payment_status, est_amount, otp_hash,
                      delivery_fee, fee_free_above, fee_rule_id, fee_reason)
  values (v_display, p_customer, p_address, v_slot_id, 'PLACED', p_payment, 'pending', v_items + v_delivery, p_otp_hash,
          v_delivery, v_q.free_above, v_q.rule_id, v_q.reason)
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from products where id = (v_item->>'product_id')::uuid;
    select price_per_kg into v_sell from product_prices where product_id = v_product.id and pincode = v_pincode;
    insert into order_items (order_id, product_id, requested_kg, cut, size, unit_price_per_kg, notes)
    values (
      v_order_id,
      v_product.id,
      (v_item->>'qty')::numeric,
      coalesce(v_item->>'size', 'standard'),
      v_item->>'size',
      coalesce(v_sell, v_product.base_price_per_kg),
      nullif(v_item->>'notes', '')
    );
  end loop;

  insert into order_status_history (order_id, from_status, to_status, actor_id, note)
  values (v_order_id, null, 'PLACED', p_customer, 'Order placed from app');

  insert into order_otps (order_id, otp) values (v_order_id, p_otp);

  return query select v_order_id, v_display, v_items + v_delivery;
end;
$$;
revoke all on function create_order(uuid, uuid, timestamptz, timestamptz, payment_mode, jsonb, text, text) from public, anon, authenticated;
grant execute on function create_order(uuid, uuid, timestamptz, timestamptz, payment_mode, jsonb, text, text) to service_role;

-- ───────────────────────── create_grocery_order: shops by the region rule ─────────────────────────
create or replace function create_grocery_order(
  p_customer    uuid,
  p_address     uuid,
  p_slot_start  timestamptz,
  p_slot_end    timestamptz,
  p_payment     payment_mode,
  p_items       jsonb,      -- [{master_product_id, qty, notes}]
  p_otp_hash    text,
  p_otp         text
) returns table (order_id uuid, display_id text, est_amount numeric, dealer_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pincode   text;
  v_lat       double precision;
  v_lng       double precision;
  v_group     uuid := gen_random_uuid();
  v_slot_id   uuid;
  v_item      jsonb;
  v_master    master_products%rowtype;
  v_qty       numeric;
  v_seen      uuid[] := '{}';
  v_fee       record;
  v_items     numeric := 0;   -- whole basket, at the shops actually chosen
  v_delivery  numeric := 0;
  v_dealer    uuid;
  v_order_id  uuid;
  v_display   text;
  v_sub       numeric;
  v_first     boolean := true;
  r           record;
begin
  if not vertical_is_active('grocery') then
    raise exception 'Grocery ordering is not open yet' using errcode = 'P0001';
  end if;
  select pincode, lat, lng into v_pincode, v_lat, v_lng from addresses where id = p_address and user_id = p_customer;
  if v_pincode is null then
    raise exception 'address not found' using errcode = 'P0002';
  end if;
  if p_slot_start <= now() then
    raise exception 'slot is in the past' using errcode = 'P0001';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'no items' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_items) > 40 then
    raise exception 'too many items' using errcode = 'P0001';
  end if;

  -- Basket lines, validated against the master.
  create temp table if not exists _gl (master uuid primary key, qty numeric, notes text, name text) on commit drop;
  truncate _gl;
  for v_item in select * from jsonb_array_elements(p_items) loop
    if (v_item->>'master_product_id')::uuid = any (v_seen) then
      raise exception 'duplicate item' using errcode = 'P0001';
    end if;
    v_seen := v_seen || (v_item->>'master_product_id')::uuid;
    select * into v_master from master_products
     where id = (v_item->>'master_product_id')::uuid and is_active and status <> 'rejected';
    if not found then
      raise exception 'product % not available', v_item->>'master_product_id' using errcode = 'P0002';
    end if;
    v_qty := (v_item->>'qty')::numeric;
    if v_qty is null or v_qty < v_master.min_qty or v_qty > (case when v_master.unit = 'kg' then 50 else 99 end) then
      raise exception 'bad quantity for %', v_master.name using errcode = 'P0001';
    end if;
    if abs(v_qty / v_master.qty_step - round(v_qty / v_master.qty_step)) > 0.001 then
      raise exception 'bad quantity for %', v_master.name using errcode = 'P0001';
    end if;
    insert into _gl values (v_master.id, v_qty, nullif(v_item->>'notes', ''), v_master.name);
  end loop;

  -- Who can supply each line right now: live grocery shops serving the
  -- address (pincode on their list, or within 5 km), open, listing active
  -- and in stock.
  create temp table if not exists _gc (master uuid, dealer uuid, selling numeric, shop numeric) on commit drop;
  truncate _gc;
  insert into _gc
  select sp.master_product_id, d.id, sp.selling_price, sp.shop_price
    from _gl g
    join store_products sp on sp.master_product_id = g.master and sp.is_active
     and (sp.out_of_stock_until is null or sp.out_of_stock_until <= now())
    join dealers d on d.id = sp.dealer_id and d.is_active and d.store_type = 'grocery'
     and d.is_open and (d.closed_until is null or d.closed_until <= now())
     and dealer_serves(d.id, v_pincode, v_lat, v_lng);

  select g.name into v_display from _gl g where not exists (select 1 from _gc c where c.master = g.master) limit 1;
  if v_display is not null then
    raise exception '% is not available right now', v_display using errcode = 'FC409';
  end if;

  -- Price the basket as it will be split: greedy by coverage, cheapest on ties.
  create temp table if not exists _ga (master uuid primary key, dealer uuid, selling numeric, shop numeric) on commit drop;
  truncate _ga;
  loop
    select c.dealer into v_dealer
      from _gc c
      join _gl g on g.master = c.master
     where not exists (select 1 from _ga a where a.master = c.master)
     group by c.dealer
     order by count(*) desc, sum(c.selling * g.qty) asc
     limit 1;
    exit when v_dealer is null;
    insert into _ga
    select c.master, c.dealer, c.selling, c.shop from _gc c
     where c.dealer = v_dealer and not exists (select 1 from _ga a where a.master = c.master);
    v_dealer := null;
  end loop;

  select sum(round(a.selling * g.qty)) into v_items from _ga a join _gl g on g.master = a.master;

  select * into v_fee from delivery_charge('grocery', v_pincode, v_items, is_first_order(p_customer));
  if v_fee.below_min then
    raise exception 'Minimum order is ₹%', v_fee.min_order::int using errcode = 'P0001';
  end if;
  v_delivery := v_fee.charge;

  insert into delivery_slots (zone_id, starts_at, ends_at)
  values (null, p_slot_start, p_slot_end)
  on conflict (zone_id, starts_at) do update set ends_at = excluded.ends_at
  returning id into v_slot_id;

  -- One order per shop. The delivery fee rides on the first (largest) one.
  for r in
    select a.dealer, sum(round(a.selling * g.qty)) as sub, count(*) as n
      from _ga a join _gl g on g.master = a.master
     group by a.dealer order by n desc, sub desc
  loop
    v_sub := r.sub + case when v_first then v_delivery else 0 end;
    v_display := 'GR-' || to_char(now() at time zone 'Asia/Kolkata', 'MMDD') || '-' || lpad(nextval('order_daily_seq')::text, 4, '0');
    insert into orders (display_id, customer_id, dealer_id, address_id, slot_id, status, payment_mode, payment_status, est_amount, otp_hash, vertical_type, group_id,
                        delivery_fee, fee_free_above, fee_rule_id, fee_reason)
    values (v_display, p_customer, r.dealer, p_address, v_slot_id, 'PLACED', p_payment, 'pending', v_sub, p_otp_hash, 'grocery', v_group,
            case when v_first then v_delivery else 0 end, v_fee.free_above, v_fee.rule_id, case when v_first then v_fee.reason else 'group' end)
    returning id into v_order_id;

    insert into order_items (order_id, master_product_id, requested_kg, cut, unit_price_per_kg, shop_unit_price, notes)
    select v_order_id, a.master, g.qty, 'standard', a.selling, a.shop, g.notes
      from _ga a join _gl g on g.master = a.master where a.dealer = r.dealer;

    insert into order_status_history (order_id, from_status, to_status, actor_id, note)
    values (v_order_id, null, 'PLACED', p_customer, 'Order placed from app');
    insert into order_otps (order_id, otp) values (v_order_id, p_otp);

    order_id := v_order_id; display_id := v_display; est_amount := v_sub; dealer_id := r.dealer;
    return next;
    v_first := false;
  end loop;
  return;
end;
$$;
revoke all on function create_grocery_order(uuid, uuid, timestamptz, timestamptz, payment_mode, jsonb, text, text) from public, anon, authenticated;
grant execute on function create_grocery_order(uuid, uuid, timestamptz, timestamptz, payment_mode, jsonb, text, text) to service_role;

insert into supabase_migrations.schema_migrations (version, name)
values ('0040', 'shop_region') on conflict (version) do nothing;
