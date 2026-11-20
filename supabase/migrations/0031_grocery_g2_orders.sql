-- 0031: grocery G2 — ordering.
--
-- Additive, dormant until verticals.grocery is active. The meat path is not
-- touched: create_order()/add_order_items() are unchanged, and the only
-- changes to existing tables are metadata-only column additions:
--   • orders.vertical_type        default 'meat' (no rewrite: default is a
--                                  constant, PG stores it in the catalog)
--   • order_items.master_product_id  nullable FK to master_products
--   • order_items.product_id      drops NOT NULL; a CHECK keeps exactly one of
--                                  product_id / master_product_id set
--   • order_items.shop_unit_price snapshot of the shop's price (grocery only;
--                                  meat keeps reading dealer_products at read time)
-- The CHECK scans order_items once at ALTER time (small table; seconds).
--
-- New: create_grocery_order() (service_role only), grocery_stores(pincode) and
-- grocery_fee(pincode) (authenticated; security definer because customers
-- cannot read `dealers`).
--
-- Rollback (reverse order):
--   drop function if exists create_grocery_order(uuid,uuid,uuid,timestamptz,timestamptz,payment_mode,jsonb,text,text);
--   drop function if exists grocery_stores(text), grocery_fee(text), master_listed_live(uuid);
--   (then re-create the 0030 "read master products" policy)
--   alter table order_items drop constraint order_items_one_product;
--   alter table order_items drop column master_product_id, drop column shop_unit_price;
--   alter table order_items alter column product_id set not null;   -- only if no grocery rows
--   alter table orders drop column vertical_type;
--   delete from supabase_migrations.schema_migrations where version = '0031';

-- ───────────────────────── orders / order_items ─────────────────────────
alter table orders
  add column if not exists vertical_type text not null default 'meat' references verticals(type);
comment on column orders.vertical_type is 'meat (products/dealer_products) or grocery (master_products/store_products)';
-- Grocery orders are a minority for a long while; a partial index keeps the
-- shop's grocery queue cheap without touching the meat plans.
create index if not exists orders_grocery_idx on orders (dealer_id, status) where vertical_type = 'grocery';

alter table order_items
  add column if not exists master_product_id uuid references master_products(id),
  add column if not exists shop_unit_price numeric(10,2);
alter table order_items alter column product_id drop not null;
alter table order_items drop constraint if exists order_items_one_product;
alter table order_items add constraint order_items_one_product
  check ((product_id is not null) <> (master_product_id is not null));
comment on column order_items.master_product_id is 'Grocery line: the master product (product_id is null)';
comment on column order_items.shop_unit_price is 'Grocery line: store_products.shop_price when ordered (what the shop is paid per unit)';
comment on column order_items.requested_kg is 'Meat: kg or pieces. Grocery: units (packs/pieces) or kg for loose items';
create index if not exists order_items_master_idx on order_items (master_product_id) where master_product_id is not null;

-- ───────────────────────── master visibility through listings ─────────────────────────
-- G1 rule: a shop may sell its own (store-scope / still-pending) items. The
-- G1 master_products policy only exposed shared+approved rows to customers,
-- so those listings would embed a null master. Definer-rights helper so the
-- check does not recurse through store_products RLS.
create index if not exists store_products_master_live_idx on store_products (master_product_id) where is_active;
create or replace function master_listed_live(p_master uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from store_products sp
    join dealers d on d.id = sp.dealer_id
    join verticals v on v.type = d.store_type
    where sp.master_product_id = p_master and sp.is_active and d.is_active and v.is_active
  )
$$;
grant execute on function master_listed_live(uuid) to authenticated;
drop policy if exists "read master products" on master_products;
create policy "read master products" on master_products
  for select using (
    auth.uid() is not null
    and status <> 'rejected'
    and is_active
    and (
      (vertical_is_active(vertical_type) and scope = 'shared' and status = 'approved')
      or (scope = 'shared' and status = 'approved' and my_store_type() = vertical_type)
      or owner_dealer_id = my_dealer_id()
      or master_listed_live(id)                -- a live shop lists it (own/pending items)
      or is_admin()
    )
  );

-- ───────────────────────── customer-facing lookups ─────────────────────────

-- Fee rule for a pincode: the zone's rule if there is one, else the
-- vertical-wide rule (zone_id null). Null row when grocery has no rule at all.
create or replace function grocery_fee(p_pincode text)
returns table (min_order numeric, fee numeric, free_above numeric)
language sql stable security definer set search_path = public as $$
  select r.min_order, r.fee, r.free_above
    from delivery_fee_rules r
    left join zone_pincodes zp on zp.zone_id = r.zone_id and zp.pincode = p_pincode
   where r.vertical_type = 'grocery' and r.is_active
     and (r.zone_id is null or zp.pincode is not null)
   order by r.zone_id nulls last
   limit 1
$$;
revoke all on function grocery_fee(text) from public, anon;
grant execute on function grocery_fee(text) to authenticated, service_role;

-- Grocery shops a customer at this pincode can order from. Definer rights:
-- the customer's RLS view of `dealers` is empty ("own dealer row"). Empty
-- while the vertical is off, so the app can key its UI on this alone.
create or replace function grocery_stores(p_pincode text)
returns table (
  id uuid, shop_name text, lat double precision, lng double precision,
  is_open boolean, closed_until timestamptz, open_windows jsonb, weekly_off int,
  item_count bigint
)
language sql stable security definer set search_path = public as $$
  select d.id, d.shop_name, d.lat, d.lng,
         (d.is_open and (d.closed_until is null or d.closed_until <= now())) as is_open,
         d.closed_until, d.open_windows, d.weekly_off,
         (select count(*) from store_products sp
           join master_products mp on mp.id = sp.master_product_id
          where sp.dealer_id = d.id and sp.is_active and mp.is_active and mp.status <> 'rejected') as item_count
    from dealers d
    join dealer_pincodes dp on dp.dealer_id = d.id and dp.pincode = p_pincode
   where d.is_active and d.store_type = 'grocery'
     and vertical_is_active('grocery')
   order by d.is_open desc, d.shop_name
$$;
revoke all on function grocery_stores(text) from public, anon;
grant execute on function grocery_stores(text) to authenticated, service_role;

-- ───────────────────────── create_grocery_order ─────────────────────────
-- One order = one shop, chosen by the customer. Prices come from the shop's
-- listing (store_products.selling_price); the shop price is snapshotted for
-- settlement. The delivery fee comes from delivery_fee_rules, never hard-coded.
-- Errors use the same codes as create_order so the API maps them the same way:
--   P0002 not found · P0001 bad input · FC409 shop closed / item out of stock
create or replace function create_grocery_order(
  p_customer    uuid,
  p_address     uuid,
  p_dealer      uuid,
  p_slot_start  timestamptz,
  p_slot_end    timestamptz,
  p_payment     payment_mode,
  p_items       jsonb,      -- [{master_product_id, qty, notes}]
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
  v_delivery   numeric := 0;
  v_item       jsonb;
  v_master     master_products%rowtype;
  v_listing    store_products%rowtype;
  v_qty        numeric;
  v_pincode    text;
  v_fee        record;
  v_seen       uuid[] := '{}';
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

  -- The shop: active grocery shop that serves this pincode and is open now.
  perform 1 from dealers d
    join dealer_pincodes dp on dp.dealer_id = d.id and dp.pincode = v_pincode
   where d.id = p_dealer and d.is_active and d.store_type = 'grocery';
  if not found then
    raise exception 'This shop does not deliver to your address' using errcode = 'P0002';
  end if;
  perform 1 from dealers d where d.id = p_dealer and d.is_open and (d.closed_until is null or d.closed_until <= now());
  if not found then
    raise exception 'The shop is closed right now' using errcode = 'FC409';
  end if;

  -- Validate every line before writing anything.
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
    select * into v_listing from store_products
     where dealer_id = p_dealer and master_product_id = v_master.id and is_active;
    if not found then
      raise exception '% is not sold by this shop', v_master.name using errcode = 'P0002';
    end if;
    if v_listing.out_of_stock_until is not null and v_listing.out_of_stock_until > now() then
      raise exception '% is out of stock', v_master.name using errcode = 'FC409';
    end if;
    v_qty := (v_item->>'qty')::numeric;
    if v_qty is null or v_qty < v_master.min_qty or v_qty > (case when v_master.unit = 'kg' then 50 else 99 end) then
      raise exception 'bad quantity for %', v_master.name using errcode = 'P0001';
    end if;
    -- whole steps only (0.25 kg, 1 pack …); tolerate float noise
    if abs(v_qty / v_master.qty_step - round(v_qty / v_master.qty_step)) > 0.001 then
      raise exception 'bad quantity for %', v_master.name using errcode = 'P0001';
    end if;
    v_items := v_items + round(v_listing.selling_price * v_qty);
  end loop;

  -- Delivery fee from the rules table (zone-specific first, then vertical-wide).
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

  v_display := 'GR-' || to_char(now() at time zone 'Asia/Kolkata', 'MMDD') || '-' || lpad(nextval('order_daily_seq')::text, 4, '0');

  insert into orders (display_id, customer_id, dealer_id, address_id, slot_id, status, payment_mode, payment_status, est_amount, otp_hash, vertical_type)
  values (v_display, p_customer, p_dealer, p_address, v_slot_id, 'PLACED', p_payment, 'pending', v_items + v_delivery, p_otp_hash, 'grocery')
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_listing from store_products
     where dealer_id = p_dealer and master_product_id = (v_item->>'master_product_id')::uuid;
    insert into order_items (order_id, master_product_id, requested_kg, cut, unit_price_per_kg, shop_unit_price, notes)
    values (
      v_order_id,
      v_listing.master_product_id,
      (v_item->>'qty')::numeric,
      'standard',
      v_listing.selling_price,
      v_listing.shop_price,
      nullif(v_item->>'notes', '')
    );
  end loop;

  insert into order_status_history (order_id, from_status, to_status, actor_id, note)
  values (v_order_id, null, 'PLACED', p_customer, 'Order placed from app');

  insert into order_otps (order_id, otp) values (v_order_id, p_otp);

  return query select v_order_id, v_display, v_items + v_delivery;
end;
$$;
revoke all on function create_grocery_order(uuid, uuid, uuid, timestamptz, timestamptz, payment_mode, jsonb, text, text) from public, anon, authenticated;
grant execute on function create_grocery_order(uuid, uuid, uuid, timestamptz, timestamptz, payment_mode, jsonb, text, text) to service_role;

insert into supabase_migrations.schema_migrations (version, name)
values ('0031', 'grocery_g2_orders') on conflict (version) do nothing;
