-- 0046: grocery shop offers.
--
-- A grocery shop (or the admin, for a shop) makes an offer; the admin approves
-- it before customers see it. Four kinds:
--   price      — pct off one product (off its MRP, else its usual price)
--   bogo       — buy N of a product, get M more of it free
--   free_gift  — a free item on orders above min_order
--   next_order — order above min_order today, get pct off the next order
--                (a personal coupon, given when the order is delivered)
-- The shop pays for every offer it makes: the app keeps its usual margin and
-- the app charge. Only one offer push per shop per day reaches customers.
--
-- Rollback:
--   drop function if exists grocery_live_offers(text, double precision, double precision);
--   drop function if exists offer_audience(uuid);
--   drop function if exists grocery_split(text, double precision, double precision, jsonb);
--   drop function if exists store_price_now(uuid, uuid, numeric, numeric, numeric);
--   (then re-run grocery_catalog and create_grocery_order from 0040)
--   alter table order_items drop column is_free, drop column shop_offer_id, drop column was_price;
--   alter table orders drop column earns_offer_id, drop column customer_coupon_id;
--   alter table dealers drop column last_offer_push_at;
--   drop table customer_coupons; drop table shop_offers;

create table if not exists shop_offers (
  id                uuid primary key default gen_random_uuid(),
  dealer_id         uuid not null references dealers(id) on delete cascade,
  kind              text not null check (kind in ('price', 'bogo', 'free_gift', 'next_order')),
  master_product_id uuid references master_products(id),   -- price/bogo: the product; free_gift: the gift
  pct               numeric(5,2),                           -- price, next_order
  buy_qty           int,                                    -- bogo
  free_qty          int,                                    -- bogo: free units; free_gift: gift units
  min_order         numeric(10,2),                          -- free_gift, next_order (items, customer price)
  max_discount      numeric(10,2),                          -- next_order cap
  valid_days        int,                                    -- next_order coupon life
  starts_at         timestamptz not null default now(),
  ends_at           timestamptz not null,
  is_active         boolean not null default true,          -- the shop's on/off switch
  status            text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reject_reason     text,
  reviewed_by       uuid references profiles(id),
  reviewed_at       timestamptz,
  pushed_at         timestamptz,                            -- when customers were told
  created_by        uuid references profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (ends_at > starts_at),
  check (kind <> 'price' or (master_product_id is not null and pct > 0 and pct < 100)),
  check (kind <> 'bogo' or (master_product_id is not null and buy_qty between 1 and 10 and free_qty between 1 and 10)),
  check (kind <> 'free_gift' or (master_product_id is not null and min_order > 0 and free_qty between 1 and 5)),
  check (kind <> 'next_order' or (pct > 0 and pct <= 100 and min_order > 0 and max_discount > 0 and valid_days between 1 and 60))
);
create index if not exists shop_offers_dealer_idx on shop_offers (dealer_id, created_at desc);
create index if not exists shop_offers_live_idx on shop_offers (kind, master_product_id) where status = 'approved' and is_active;
drop trigger if exists shop_offers_updated_at on shop_offers;
create trigger shop_offers_updated_at before update on shop_offers for each row execute function set_updated_at();
alter table shop_offers enable row level security;   -- read through the API and the functions below only
grant all on shop_offers to service_role;

-- "Order now, get x% off your next order": one coupon per qualifying order.
create table if not exists customer_coupons (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references profiles(id) on delete cascade,
  dealer_id       uuid not null references dealers(id) on delete cascade,  -- the shop that pays for it
  shop_offer_id   uuid references shop_offers(id) on delete set null,
  source_order_id uuid not null unique references orders(id) on delete cascade,
  pct             numeric(5,2) not null,
  max_discount    numeric(10,2) not null,
  expires_at      timestamptz not null,
  used_order_id   uuid references orders(id) on delete set null,
  used_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists customer_coupons_customer_idx on customer_coupons (customer_id) where used_order_id is null;
alter table customer_coupons enable row level security;
drop policy if exists "own coupons" on customer_coupons;
create policy "own coupons" on customer_coupons for select using (customer_id = auth.uid() or is_admin());
grant select on customer_coupons to authenticated;
grant all on customer_coupons to service_role;

alter table orders
  add column if not exists earns_offer_id     uuid references shop_offers(id) on delete set null,   -- gives a next-order coupon on delivery
  add column if not exists customer_coupon_id uuid references customer_coupons(id) on delete set null;
alter table order_items
  add column if not exists is_free       boolean not null default false,   -- given by an offer (bogo / free gift), ₹0
  add column if not exists shop_offer_id uuid references shop_offers(id) on delete set null,
  add column if not exists was_price     numeric(10,2);                    -- usual customer price when a price offer applied
alter table dealers add column if not exists last_offer_push_at timestamptz;

-- ───────────────────────── price of a listing right now ─────────────────────────
-- A live price offer lowers the customer price; the shop gives the whole
-- discount, so the shop price drops by the same rupees. An offer that would
-- leave the shop ₹0 or less, or would not lower the price, is ignored.
create or replace function store_price_now(p_dealer uuid, p_master uuid, p_selling numeric, p_shop numeric, p_mrp numeric)
returns table (selling numeric, shop numeric, offer_id uuid, was_price numeric, pct numeric)
language sql stable security definer set search_path = public as $$
  with o as (
    select so.id, so.pct, round(coalesce(p_mrp, p_selling) * (100 - so.pct) / 100) as price
      from shop_offers so
     where so.dealer_id = p_dealer and so.master_product_id = p_master and so.kind = 'price'
       and so.status = 'approved' and so.is_active and so.starts_at <= now() and so.ends_at > now()
     order by 3 asc
     limit 1
  ), ok as (
    select o.*, (o.price < p_selling and p_shop - (p_selling - o.price) > 0) as good from o
  )
  select case when ok.good then ok.price else p_selling end,
         case when ok.good then p_shop - (p_selling - ok.price) else p_shop end,
         case when ok.good then ok.id end,
         case when ok.good then p_selling end,
         case when ok.good then ok.pct end
    from (select 1) one left join ok on true
$$;
revoke all on function store_price_now(uuid, uuid, numeric, numeric, numeric) from public, anon, authenticated;
grant execute on function store_price_now(uuid, uuid, numeric, numeric, numeric) to service_role;

-- ───────────────────────── grocery list for an address (with offers) ─────────────────────────
drop function if exists grocery_catalog(text, double precision, double precision);
create function grocery_catalog(p_pincode text, p_lat double precision default null, p_lng double precision default null)
returns table (
  master_product_id uuid, name text, name_ta text, brand text, pack_size text,
  unit text, min_qty numeric, qty_step numeric, image_path text, category_id uuid,
  selling_price numeric, mrp numeric, in_stock boolean, shops bigint, card_bg text,
  offer_pct numeric, bogo_buy int, bogo_free int
)
language sql stable security definer set search_path = public as $$
  with live as (
    select sp.master_product_id, sp.dealer_id, pn.selling as selling_price, pn.pct, sp.mrp,
           (sp.out_of_stock_until is null or sp.out_of_stock_until <= now()) as ok
      from store_products sp
      join dealers d on d.id = sp.dealer_id
      cross join lateral store_price_now(sp.dealer_id, sp.master_product_id, sp.selling_price, sp.shop_price, sp.mrp) pn
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
           max(l.mrp) as mrp,
           max(l.pct) filter (where l.ok) as offer_pct
      from live l group by l.master_product_id
  ),
  bogo as (
    select distinct on (so.master_product_id) so.master_product_id, so.buy_qty, so.free_qty
      from shop_offers so
      join live l on l.master_product_id = so.master_product_id and l.dealer_id = so.dealer_id and l.ok
     where so.kind = 'bogo' and so.status = 'approved' and so.is_active and so.starts_at <= now() and so.ends_at > now()
     order by so.master_product_id, so.free_qty::numeric / so.buy_qty desc
  )
  select m.id, m.name, m.name_ta, m.brand, m.pack_size, m.unit, m.min_qty, m.qty_step, m.image_path, m.category_id,
         b.selling_price, coalesce(m.mrp, b.mrp), b.in_stock, b.shops, m.card_bg,
         b.offer_pct, g.buy_qty, g.free_qty
    from best b
    join master_products m on m.id = b.master_product_id
    left join bogo g on g.master_product_id = b.master_product_id
   where m.is_active and m.status <> 'rejected'
   order by m.name
$$;
revoke all on function grocery_catalog(text, double precision, double precision) from public, anon;
grant execute on function grocery_catalog(text, double precision, double precision) to authenticated, service_role;

-- ───────────────────────── which shop supplies each line ─────────────────────────
-- Greedy: the shop covering most lines first, cheapest on ties. Used by the
-- order itself and by the cart preview, so both always agree. Lines no shop
-- can supply are left out (the order raises; the preview shows them as is).
create or replace function grocery_split(p_pincode text, p_lat double precision, p_lng double precision, p_items jsonb)
returns table (master uuid, dealer uuid, selling numeric, shop numeric, qty numeric, offer_id uuid, was_price numeric)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_dealer uuid;
begin
  create temp table if not exists _sl (m uuid primary key, q numeric) on commit drop;
  truncate _sl;
  insert into _sl select (e->>'master_product_id')::uuid, (e->>'qty')::numeric from jsonb_array_elements(p_items) e on conflict do nothing;

  create temp table if not exists _sc (m uuid, d uuid, sell numeric, sh numeric, oid uuid, was numeric) on commit drop;
  truncate _sc;
  insert into _sc
  select sp.master_product_id, dl.id, pn.selling, pn.shop, pn.offer_id, pn.was_price
    from _sl g
    join store_products sp on sp.master_product_id = g.m and sp.is_active
     and (sp.out_of_stock_until is null or sp.out_of_stock_until <= now())
    join dealers dl on dl.id = sp.dealer_id and dl.is_active and dl.store_type = 'grocery'
     and dl.is_open and (dl.closed_until is null or dl.closed_until <= now())
     and dealer_serves(dl.id, p_pincode, p_lat, p_lng)
    cross join lateral store_price_now(sp.dealer_id, sp.master_product_id, sp.selling_price, sp.shop_price, sp.mrp) pn;

  create temp table if not exists _sa (m uuid primary key, d uuid, sell numeric, sh numeric, oid uuid, was numeric) on commit drop;
  truncate _sa;
  loop
    select c.d into v_dealer
      from _sc c
      join _sl g on g.m = c.m
     where not exists (select 1 from _sa a where a.m = c.m)
     group by c.d
     order by count(*) desc, sum(c.sell * g.q) asc
     limit 1;
    exit when v_dealer is null;
    insert into _sa
    select distinct on (c.m) c.m, c.d, c.sell, c.sh, c.oid, c.was from _sc c
     where c.d = v_dealer and not exists (select 1 from _sa a where a.m = c.m)
     order by c.m;
    v_dealer := null;
  end loop;

  return query select a.m, a.d, a.sell, a.sh, g.q, a.oid, a.was from _sa a join _sl g on g.m = a.m;
end;
$$;
revoke all on function grocery_split(text, double precision, double precision, jsonb) from public, anon, authenticated;
grant execute on function grocery_split(text, double precision, double precision, jsonb) to service_role;

-- ───────────────────────── place a grocery basket (offer prices) ─────────────────────────
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
  v_items     numeric := 0;
  v_delivery  numeric := 0;
  v_order_id  uuid;
  v_display   text;
  v_sub       numeric;
  v_first     boolean := true;
  r           record;
begin
  if not vertical_is_active('grocery') then
    raise exception 'Grocery ordering is not open yet' using errcode = 'P0001';
  end if;
  select a.pincode, a.lat, a.lng into v_pincode, v_lat, v_lng from addresses a where a.id = p_address and a.user_id = p_customer;
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

  -- Which shop supplies each line, at today's (offer) prices.
  create temp table if not exists _gb (master uuid primary key, dealer uuid, selling numeric, shop numeric, offer_id uuid, was_price numeric) on commit drop;
  truncate _gb;
  insert into _gb select s.master, s.dealer, s.selling, s.shop, s.offer_id, s.was_price from grocery_split(v_pincode, v_lat, v_lng, p_items) s;

  select g.name into v_display from _gl g where not exists (select 1 from _gb b where b.master = g.master) limit 1;
  if v_display is not null then
    raise exception '% is not available right now', v_display using errcode = 'FC409';
  end if;

  select sum(round(b.selling * g.qty)) into v_items from _gb b join _gl g on g.master = b.master;

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
    select b.dealer, sum(round(b.selling * g.qty)) as sub, count(*) as n
      from _gb b join _gl g on g.master = b.master
     group by b.dealer order by n desc, sub desc
  loop
    v_sub := r.sub + case when v_first then v_delivery else 0 end;
    v_display := 'GR-' || to_char(now() at time zone 'Asia/Kolkata', 'MMDD') || '-' || lpad(nextval('order_daily_seq')::text, 4, '0');
    insert into orders (display_id, customer_id, dealer_id, address_id, slot_id, status, payment_mode, payment_status, est_amount, otp_hash, vertical_type, group_id,
                        delivery_fee, fee_free_above, fee_rule_id, fee_reason)
    values (v_display, p_customer, r.dealer, p_address, v_slot_id, 'PLACED', p_payment, 'pending', v_sub, p_otp_hash, 'grocery', v_group,
            case when v_first then v_delivery else 0 end, v_fee.free_above, v_fee.rule_id, case when v_first then v_fee.reason else 'group' end)
    returning id into v_order_id;

    insert into order_items (order_id, master_product_id, requested_kg, cut, unit_price_per_kg, shop_unit_price, notes, shop_offer_id, was_price)
    select v_order_id, b.master, g.qty, 'standard', b.selling, b.shop, g.notes, b.offer_id, b.was_price
      from _gb b join _gl g on g.master = b.master where b.dealer = r.dealer;

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

-- ───────────────────────── live offers near an address ─────────────────────────
-- What the customer app shows on the offers strip. No shop names: customers
-- never see which shop. Offers whose product the shop has hidden or run out
-- of are left out.
create or replace function grocery_live_offers(p_pincode text, p_lat double precision default null, p_lng double precision default null)
returns table (
  id uuid, kind text, pct numeric, buy_qty int, free_qty int, min_order numeric, max_discount numeric, valid_days int, ends_at timestamptz,
  master_product_id uuid, name text, name_ta text, pack_size text, image_path text, card_bg text, mrp numeric, price numeric, was_price numeric
)
language sql stable security definer set search_path = public as $$
  select so.id, so.kind, so.pct, so.buy_qty, so.free_qty, so.min_order, so.max_discount, so.valid_days, so.ends_at,
         m.id, m.name, m.name_ta, m.pack_size, m.image_path, m.card_bg, coalesce(m.mrp, sp.mrp), pn.selling, pn.was_price
    from shop_offers so
    join dealers d on d.id = so.dealer_id and d.is_active and d.store_type = 'grocery'
     and d.is_open and (d.closed_until is null or d.closed_until <= now())
    left join master_products m on m.id = so.master_product_id
    left join store_products sp on sp.dealer_id = so.dealer_id and sp.master_product_id = so.master_product_id
    left join lateral store_price_now(sp.dealer_id, sp.master_product_id, sp.selling_price, sp.shop_price, sp.mrp) pn on sp.dealer_id is not null
   where so.status = 'approved' and so.is_active and so.starts_at <= now() and so.ends_at > now()
     and vertical_is_active('grocery')
     and dealer_serves(d.id, p_pincode, p_lat, p_lng)
     and (so.kind = 'next_order' or (sp.is_active and (sp.out_of_stock_until is null or sp.out_of_stock_until <= now())))
     and (so.kind <> 'price' or pn.offer_id = so.id)
   order by case so.kind when 'price' then 1 when 'bogo' then 2 when 'free_gift' then 3 else 4 end, so.created_at desc
$$;
revoke all on function grocery_live_offers(text, double precision, double precision) from public, anon;
grant execute on function grocery_live_offers(text, double precision, double precision) to authenticated, service_role;

-- Customers a shop's offer push goes to: everyone with a saved address the shop serves.
create or replace function offer_audience(p_dealer uuid)
returns table (user_id uuid)
language sql stable security definer set search_path = public as $$
  select distinct a.user_id
    from addresses a
    join profiles p on p.id = a.user_id and p.role = 'customer'
   where dealer_serves(p_dealer, a.pincode, a.lat, a.lng)
$$;
revoke all on function offer_audience(uuid) from public, anon, authenticated;
grant execute on function offer_audience(uuid) to service_role;

insert into supabase_migrations.schema_migrations (version, name)
values ('0046', 'shop_offers') on conflict (version) do nothing;
