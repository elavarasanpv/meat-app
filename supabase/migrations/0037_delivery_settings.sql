-- 0037: delivery settings the admin controls.
--
-- Until now meat's delivery fee (₹20, free from ₹499, no minimum) was written
-- into the order functions, the API and the app; grocery read one rule per
-- zone. Now both read the same table:
--
--   delivery_fee_rules   one default rule per vertical (pincode null) plus
--                        optional rules for single pincodes. A pincode rule
--                        beats the default.
--   verticals.first_order_free   free delivery on a customer's first order.
--   orders.delivery_fee …        the fee is saved on the order when it is
--                        placed, so a later rule change never touches it.
--
-- Seeds keep today's numbers, so nothing changes until the admin edits a rule.

-- ───────────────────────── rules ─────────────────────────
alter table delivery_fee_rules
  add column if not exists pincode    text check (pincode ~ '^[0-9]{6}$'),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references profiles(id);

-- Rules are per pincode from here on; zone rules stop applying.
update delivery_fee_rules set is_active = false where zone_id is not null;

-- One rule per vertical and place: keep the newest if there are several.
delete from delivery_fee_rules a using delivery_fee_rules b
 where a.zone_id is null and b.zone_id is null and a.pincode is null and b.pincode is null
   and a.vertical_type = b.vertical_type
   and (a.created_at, a.id) < (b.created_at, b.id);
create unique index if not exists delivery_fee_rules_place_uq
  on delivery_fee_rules (vertical_type, coalesce(pincode, '')) where zone_id is null;

-- Default rules, with today's numbers.
insert into delivery_fee_rules (vertical_type, min_order, fee, free_above)
select 'meat', 0, 20, 499
 where not exists (select 1 from delivery_fee_rules where vertical_type = 'meat' and zone_id is null and pincode is null);
insert into delivery_fee_rules (vertical_type, min_order, fee, free_above)
select 'grocery', 99, 20, 499
 where not exists (select 1 from delivery_fee_rules where vertical_type = 'grocery' and zone_id is null and pincode is null);
-- The default rule is always on (the admin page has no switch for it).
update delivery_fee_rules set is_active = true where zone_id is null and pincode is null;

alter table verticals add column if not exists first_order_free boolean not null default false;

-- ───────────────────────── fee saved on the order ─────────────────────────
alter table orders
  add column if not exists delivery_fee   numeric(10,2),
  add column if not exists fee_free_above numeric(10,2),   -- the "free from" amount when the order was placed
  add column if not exists fee_rule_id    uuid references delivery_fee_rules(id) on delete set null,
  add column if not exists fee_reason     text;            -- fee | free_above | first_order | no_fee | group

-- Orders placed before this: work the fee out the way it was charged.
update orders o
   set delivery_fee = case
         when o.vertical_type = 'grocery' then greatest(0, least(o.est_amount, o.est_amount - coalesce(s.items, 0)))
         when coalesce(s.items, 0) >= 499 then 0 else 20 end,
       fee_free_above = 499
  from (select o2.id,
               (select sum(round(i.unit_price_per_kg * i.requested_kg)) from order_items i
                 where i.order_id = o2.id and not i.unavailable) as items
          from orders o2) s
 where s.id = o.id and o.delivery_fee is null;

-- ───────────────────────── the one place that works out the fee ─────────────────────────
-- A cancelled order does not use up the free first delivery.
create or replace function is_first_order(p_customer uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_customer is not null
     and not exists (select 1 from orders o where o.customer_id = p_customer and o.status <> 'CANCELLED')
$$;
revoke all on function is_first_order(uuid) from public, anon, authenticated;
grant execute on function is_first_order(uuid) to service_role;

-- Terms for a vertical at a pincode, and what a basket of p_items pays.
-- Always one row; with no rule at all there is no minimum and no fee.
create or replace function delivery_charge(p_vertical text, p_pincode text, p_items numeric, p_first boolean)
returns table (
  rule_id uuid, rule_pincode text, min_order numeric, fee numeric, free_above numeric,
  first_order_free boolean, below_min boolean, charge numeric, reason text
)
language sql stable security definer set search_path = public as $$
  with t as (
    select r.id, r.pincode, coalesce(r.min_order, 0) as min_order, coalesce(r.fee, 0) as fee, r.free_above,
           coalesce((select v.first_order_free from verticals v where v.type = p_vertical), false) as fof,
           coalesce(p_items, 0) as items
      from (select 1) one
      left join lateral (
        select x.id, x.pincode, x.min_order, x.fee, x.free_above
          from delivery_fee_rules x
         where x.vertical_type = p_vertical and x.is_active and x.zone_id is null
           and (x.pincode is null or x.pincode = p_pincode)
         order by x.pincode nulls last
         limit 1
      ) r on true
  )
  select t.id, t.pincode, t.min_order, t.fee, t.free_above, t.fof,
         t.items < t.min_order,
         case when t.fee = 0 then 0
              when t.free_above is not null and t.items >= t.free_above then 0
              when t.fof and coalesce(p_first, false) then 0
              else t.fee end,
         case when t.fee = 0 then 'no_fee'
              when t.free_above is not null and t.items >= t.free_above then 'free_above'
              when t.fof and coalesce(p_first, false) then 'first_order'
              else 'fee' end
    from t
$$;
revoke all on function delivery_charge(text, text, numeric, boolean) from public, anon, authenticated;
grant execute on function delivery_charge(text, text, numeric, boolean) to service_role;

-- What the app shows in the cart: the terms for the signed-in customer.
create or replace function delivery_quote(p_vertical text, p_pincode text)
returns table (min_order numeric, fee numeric, free_above numeric, first_order_free boolean)
language sql stable security definer set search_path = public as $$
  select c.min_order, c.fee, c.free_above, (c.first_order_free and is_first_order(auth.uid()))
    from delivery_charge(p_vertical, p_pincode, 0, false) c
$$;
revoke all on function delivery_quote(text, text) from public, anon;
grant execute on function delivery_quote(text, text) to authenticated, service_role;

-- Older app builds still call this one for grocery.
create or replace function grocery_fee(p_pincode text)
returns table (min_order numeric, fee numeric, free_above numeric)
language sql stable security definer set search_path = public as $$
  select c.min_order, c.fee, c.free_above
    from delivery_charge('grocery', p_pincode, 0, false) c
   where c.rule_id is not null
$$;
revoke all on function grocery_fee(text) from public, anon;
grant execute on function grocery_fee(text) to authenticated, service_role;

-- ───────────────────────── create_order: fee from the rules ─────────────────────────
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
begin
  select pincode into v_pincode from addresses where id = p_address and user_id = p_customer;
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

-- ───────────────────────── add_order_items: keeps the saved fee ─────────────────────────
create or replace function add_order_items(
  p_order    uuid,
  p_customer uuid,
  p_items    jsonb
) returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status    order_status;
  v_customer  uuid;
  v_discount  numeric;
  v_item      jsonb;
  v_product   products%rowtype;
  v_qty       numeric;
  v_line      uuid;
  v_items     numeric;
  v_est       numeric;
  v_added     int := 0;
  v_pincode   text;
  v_sell      numeric;
  v_fee       numeric;
  v_free      numeric;
  v_reason    text;
begin
  select o.status, o.customer_id, coalesce(o.discount_amount, 0), a.pincode, o.delivery_fee, o.fee_free_above, o.fee_reason
    into v_status, v_customer, v_discount, v_pincode, v_fee, v_free, v_reason
    from orders o join addresses a on a.id = o.address_id
   where o.id = p_order for update of o;
  if not found or v_customer <> p_customer then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if v_status not in ('PLACED', 'DEALER_ASSIGNED') then
    raise exception 'The shop has already started on this order' using errcode = 'FC409';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'no items' using errcode = 'P0001';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from products where id = (v_item->>'product_id')::uuid and is_active;
    if not found then
      raise exception 'product % not available', v_item->>'product_id' using errcode = 'P0002';
    end if;
    v_qty := (v_item->>'qty')::numeric;
    if v_qty <= 0 or v_qty > 50 then
      raise exception 'bad quantity' using errcode = 'P0001';
    end if;

    select id into v_line from order_items
     where order_id = p_order and product_id = v_product.id and not unavailable
       and coalesce(size, '') = coalesce(v_item->>'size', '')
     limit 1;
    if found then
      update order_items set requested_kg = least(50, requested_kg + v_qty) where id = v_line;
    else
      select price_per_kg into v_sell from product_prices where product_id = v_product.id and pincode = v_pincode;
      insert into order_items (order_id, product_id, requested_kg, cut, size, unit_price_per_kg, notes)
      values (p_order, v_product.id, v_qty, coalesce(v_item->>'size', 'standard'), v_item->>'size', coalesce(v_sell, v_product.base_price_per_kg), nullif(v_item->>'notes', ''));
    end if;
    v_added := v_added + 1;
  end loop;

  select coalesce(sum(round(unit_price_per_kg * requested_kg)), 0) into v_items
    from order_items where order_id = p_order and not unavailable;
  -- The fee was fixed when the order was placed. Adding items can only take
  -- it away (the basket crossed the free-delivery amount saved on the order).
  if v_fee is null then
    v_fee := case when v_items >= 499 then 0 else 20 end;   -- order from before fees were saved
  elsif v_fee > 0 and v_free is not null and v_items >= v_free then
    v_fee := 0;
    v_reason := 'free_above';
  end if;
  v_est := greatest(0, v_items - v_discount) + v_fee;

  update orders set est_amount = v_est, delivery_fee = v_fee, fee_reason = v_reason, items_added_at = now() where id = p_order;
  insert into order_status_history (order_id, from_status, to_status, actor_id, note)
  values (p_order, v_status, v_status, p_customer, 'customer added ' || v_added || ' item(s)');

  return v_est;
end;
$$;
revoke all on function add_order_items(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function add_order_items(uuid, uuid, jsonb) to service_role;

-- ───────────────────────── create_grocery_order: fee from the rules ─────────────────────────
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
values ('0037', 'delivery_settings') on conflict (version) do nothing;
