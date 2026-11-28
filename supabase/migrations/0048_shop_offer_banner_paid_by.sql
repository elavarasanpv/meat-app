-- 0048: an offer can carry its own banner picture, and the admin can say who
-- pays for an offer.
--
--   banner_path : a picture for the offer card (else the product's photo)
--   paid_by     : 'shop' (every offer a shop makes) or 'app' (Thanjoz Mart
--                 pays; only the admin can set it)
--
-- When Thanjoz Mart pays, the shop is paid as if there were no offer:
--   price      : the customer price drops, the shop price stays
--   bogo/gift  : the free units are paid to the shop at its shop price (API)
--   next_order : the coupon comes off the customer's bill only (API)
--
-- Roll back:
--   re-run the store_price_now and grocery_live_offers blocks of 0047, then
--   alter table customer_coupons drop column paid_by;
--   alter table shop_offers drop column banner_path, drop column paid_by;

alter table shop_offers
  add column if not exists banner_path text,
  add column if not exists paid_by     text not null default 'shop' check (paid_by in ('shop', 'app'));
alter table customer_coupons
  add column if not exists paid_by text not null default 'shop' check (paid_by in ('shop', 'app'));

-- ───────────────────────── price of a listing right now ─────────────────────────
-- As 0047. An offer Thanjoz Mart pays for leaves the shop price alone, so it
-- only has to lower the customer price.
create or replace function store_price_now(p_dealer uuid, p_master uuid, p_selling numeric, p_shop numeric, p_mrp numeric)
returns table (selling numeric, shop numeric, offer_id uuid, was_price numeric, pct numeric)
language sql stable security definer set search_path = public as $$
  with o as (
    select so.id, so.pct, so.paid_by, round(coalesce(p_mrp, p_selling) * (100 - so.pct) / 100) as price
      from shop_offers so
     where so.dealer_id = p_dealer and so.kind = 'price' and shop_offer_covers(so, p_master)
       and so.status = 'approved' and so.is_active and so.starts_at <= now() and so.ends_at > now()
  ), ok as (
    select o.*, (o.price < p_selling and (o.paid_by = 'app' or p_shop - (p_selling - o.price) > 0)) as good from o
     order by 5 desc, o.price asc
     limit 1
  )
  select case when ok.good then ok.price else p_selling end,
         case when ok.good and ok.paid_by = 'shop' then p_shop - (p_selling - ok.price) else p_shop end,
         case when ok.good then ok.id end,
         case when ok.good then p_selling end,
         case when ok.good then ok.pct end
    from (select 1) one left join ok on true
$$;
revoke all on function store_price_now(uuid, uuid, numeric, numeric, numeric) from public, anon, authenticated;
grant execute on function store_price_now(uuid, uuid, numeric, numeric, numeric) to service_role;

-- ───────────────────────── live offers near an address ─────────────────────────
-- As 0047, plus the offer's own banner picture.
drop function if exists grocery_live_offers(text, double precision, double precision);
create function grocery_live_offers(p_pincode text, p_lat double precision default null, p_lng double precision default null)
returns table (
  id uuid, kind text, pct numeric, buy_qty int, free_qty int, min_order numeric, max_discount numeric, valid_days int, ends_at timestamptz,
  master_product_id uuid, name text, name_ta text, pack_size text, image_path text, card_bg text, mrp numeric, price numeric, was_price numeric,
  scope text, category_id uuid, category_name text, category_name_ta text, product_ids uuid[], banner_path text
)
language sql stable security definer set search_path = public as $$
  select so.id, so.kind, so.pct, so.buy_qty, so.free_qty, so.min_order, so.max_discount, so.valid_days, so.ends_at,
         m.id, m.name, m.name_ta, m.pack_size, m.image_path, m.card_bg, coalesce(m.mrp, sp.mrp),
         case when so.scope = 'product' then pn.selling end, case when so.scope = 'product' then pn.was_price end,
         so.scope, so.category_id, cc.name, cc.name_ta, cov.ids, so.banner_path
    from shop_offers so
    join dealers d on d.id = so.dealer_id and d.is_active and d.store_type = 'grocery'
     and d.is_open and (d.closed_until is null or d.closed_until <= now())
    left join master_products m on m.id = so.master_product_id
    left join store_products sp on sp.dealer_id = so.dealer_id and sp.master_product_id = so.master_product_id
    left join lateral store_price_now(sp.dealer_id, sp.master_product_id, sp.selling_price, sp.shop_price, sp.mrp) pn on sp.dealer_id is not null
    left join catalog_categories cc on cc.id = so.category_id
    left join lateral (
      select array_agg(x.master_product_id) as ids
        from store_products x
        join master_products xm on xm.id = x.master_product_id and xm.is_active and xm.status <> 'rejected'
        cross join lateral store_price_now(x.dealer_id, x.master_product_id, x.selling_price, x.shop_price, x.mrp) xp
       where so.kind in ('price', 'bogo') and x.dealer_id = so.dealer_id and x.is_active
         and (x.out_of_stock_until is null or x.out_of_stock_until <= now())
         and shop_offer_covers(so, x.master_product_id)
         and (so.kind <> 'price' or xp.offer_id = so.id)
    ) cov on true
   where so.status = 'approved' and so.is_active and so.starts_at <= now() and so.ends_at > now()
     and vertical_is_active('grocery')
     and dealer_serves(d.id, p_pincode, p_lat, p_lng)
     and (so.kind = 'next_order'
          or (so.kind = 'free_gift' and sp.is_active and (sp.out_of_stock_until is null or sp.out_of_stock_until <= now()))
          or (so.kind in ('price', 'bogo') and cardinality(cov.ids) >= 1))
   order by case so.kind when 'price' then 1 when 'bogo' then 2 when 'free_gift' then 3 else 4 end, so.created_at desc
$$;
revoke all on function grocery_live_offers(text, double precision, double precision) from public, anon;
grant execute on function grocery_live_offers(text, double precision, double precision) to authenticated, service_role;

insert into supabase_migrations.schema_migrations (version, name)
values ('0048', 'shop_offer_banner_paid_by') on conflict (version) do nothing;
