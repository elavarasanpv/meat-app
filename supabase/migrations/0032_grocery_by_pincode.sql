-- 0032: grocery by pincode — the customer never picks a shop.
--
-- The app lists every grocery item sold by any live shop serving the
-- customer's pincode (grocery_catalog). At checkout the server chooses the
-- shops: the one that covers the most lines first, then the next for what's
-- left, so a basket silently becomes one order per shop. One delivery fee,
-- one minimum-order check, both on the whole basket.
--
-- Meat path untouched. Grocery-only changes:
--   • orders.group_id            lines up the orders one checkout produced
--   • grocery_catalog(pincode)   replaces the per-shop listing read
--   • create_grocery_order()     new signature (no p_dealer); the old one is dropped
--
-- Rollback:
--   drop function if exists create_grocery_order(uuid,uuid,timestamptz,timestamptz,payment_mode,jsonb,text,text);
--   drop function if exists grocery_catalog(text);
--   alter table orders drop column if exists group_id;
--   (then re-run the create_grocery_order block of 0031)
--   delete from supabase_migrations.schema_migrations where version = '0032';

alter table orders add column if not exists group_id uuid;
comment on column orders.group_id is 'Grocery: orders placed together from one basket (one per shop) share a group id';
create index if not exists orders_group_idx on orders (group_id) where group_id is not null;

-- ───────────────────────── what a pincode can buy ─────────────────────────
-- One row per master product any live grocery shop serving the pincode lists.
-- Price is the cheapest in-stock listing (or cheapest at all when every shop
-- is out); in_stock says whether anyone can supply it right now.
create or replace function grocery_catalog(p_pincode text)
returns table (
  master_product_id uuid, name text, name_ta text, brand text, pack_size text,
  unit text, min_qty numeric, qty_step numeric, image_path text, category_id uuid,
  selling_price numeric, mrp numeric, in_stock boolean, shops bigint
)
language sql stable security definer set search_path = public as $$
  with live as (
    select sp.master_product_id, sp.selling_price, sp.mrp,
           (sp.out_of_stock_until is null or sp.out_of_stock_until <= now()) as ok
      from store_products sp
      join dealers d on d.id = sp.dealer_id
      join dealer_pincodes dp on dp.dealer_id = d.id and dp.pincode = p_pincode
     where sp.is_active and d.is_active and d.store_type = 'grocery'
       and d.is_open and (d.closed_until is null or d.closed_until <= now())
       and vertical_is_active('grocery')
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
         b.selling_price, coalesce(m.mrp, b.mrp), b.in_stock, b.shops
    from best b
    join master_products m on m.id = b.master_product_id
   where m.is_active and m.status <> 'rejected'
   order by m.name
$$;
revoke all on function grocery_catalog(text) from public, anon;
grant execute on function grocery_catalog(text) to authenticated, service_role;

-- ───────────────────────── create_grocery_order (v2) ─────────────────────────
drop function if exists create_grocery_order(uuid, uuid, uuid, timestamptz, timestamptz, payment_mode, jsonb, text, text);

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
  select pincode into v_pincode from addresses where id = p_address and user_id = p_customer;
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
  -- pincode, open, listing active and in stock.
  create temp table if not exists _gc (master uuid, dealer uuid, selling numeric, shop numeric) on commit drop;
  truncate _gc;
  insert into _gc
  select sp.master_product_id, d.id, sp.selling_price, sp.shop_price
    from _gl g
    join store_products sp on sp.master_product_id = g.master and sp.is_active
     and (sp.out_of_stock_until is null or sp.out_of_stock_until <= now())
    join dealers d on d.id = sp.dealer_id and d.is_active and d.store_type = 'grocery'
     and d.is_open and (d.closed_until is null or d.closed_until <= now())
    join dealer_pincodes dp on dp.dealer_id = d.id and dp.pincode = v_pincode;

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

  select * into v_fee from grocery_fee(v_pincode);
  if v_fee.min_order is not null then
    if v_items < v_fee.min_order then
      raise exception 'Minimum order is ₹%', v_fee.min_order::int using errcode = 'P0001';
    end if;
    v_delivery := case when v_fee.free_above is not null and v_items >= v_fee.free_above then 0 else v_fee.fee end;
  end if;

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
    insert into orders (display_id, customer_id, dealer_id, address_id, slot_id, status, payment_mode, payment_status, est_amount, otp_hash, vertical_type, group_id)
    values (v_display, p_customer, r.dealer, p_address, v_slot_id, 'PLACED', p_payment, 'pending', v_sub, p_otp_hash, 'grocery', v_group)
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
values ('0032', 'grocery_by_pincode') on conflict (version) do nothing;
