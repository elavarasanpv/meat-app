-- 0047: an offer can cover one product, several chosen products, or a whole
-- (sub-)category of the shop's products.
--
--   scope 'product'  : master_product_id (as before)
--   scope 'products' : product_ids
--   scope 'category' : category_id, and its sub-categories
--
-- master_product_id stays filled for price / buy-get-free offers of every
-- scope: it is the product whose photo the offer card shows. Free gifts and
-- next-order coupons are unchanged.
--
-- Roll back:
--   re-run the store_price_now, grocery_catalog and grocery_live_offers blocks of 0046, then
--   drop function shop_offer_covers(shop_offers, uuid);
--   alter table shop_offers drop column scope, drop column product_ids, drop column category_id;

alter table shop_offers
  add column if not exists scope       text not null default 'product' check (scope in ('product', 'products', 'category')),
  add column if not exists product_ids uuid[],
  add column if not exists category_id uuid references catalog_categories(id) on delete set null;

-- Does this offer cover this product?
create or replace function shop_offer_covers(o shop_offers, p_master uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select case o.scope
    when 'products' then p_master = any (coalesce(o.product_ids, '{}'))
    when 'category' then exists (
      select 1 from master_products m
        left join catalog_categories c on c.id = m.category_id
       where m.id = p_master and o.category_id is not null and (m.category_id = o.category_id or c.parent_id = o.category_id))
    else o.master_product_id = p_master
  end
$$;
revoke all on function shop_offer_covers(shop_offers, uuid) from public, anon, authenticated;
grant execute on function shop_offer_covers(shop_offers, uuid) to service_role;

-- ───────────────────────── price of a listing right now ─────────────────────────
-- As 0046, but an offer may reach the product through its list or category.
-- Where several do, the lowest price the shop can afford wins.
create or replace function store_price_now(p_dealer uuid, p_master uuid, p_selling numeric, p_shop numeric, p_mrp numeric)
returns table (selling numeric, shop numeric, offer_id uuid, was_price numeric, pct numeric)
language sql stable security definer set search_path = public as $$
  with o as (
    select so.id, so.pct, round(coalesce(p_mrp, p_selling) * (100 - so.pct) / 100) as price
      from shop_offers so
     where so.dealer_id = p_dealer and so.kind = 'price' and shop_offer_covers(so, p_master)
       and so.status = 'approved' and so.is_active and so.starts_at <= now() and so.ends_at > now()
  ), ok as (
    select o.*, (o.price < p_selling and p_shop - (p_selling - o.price) > 0) as good from o
     order by 4 desc, o.price asc
     limit 1
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
create or replace function grocery_catalog(p_pincode text, p_lat double precision default null, p_lng double precision default null)
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
    select distinct on (l.master_product_id) l.master_product_id, so.buy_qty, so.free_qty
      from live l
      join shop_offers so on so.dealer_id = l.dealer_id and so.kind = 'bogo'
       and so.status = 'approved' and so.is_active and so.starts_at <= now() and so.ends_at > now()
       and shop_offer_covers(so, l.master_product_id)
     where l.ok
     order by l.master_product_id, so.free_qty::numeric / so.buy_qty desc
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

-- ───────────────────────── live offers near an address ─────────────────────────
-- Adds what a many-product offer needs: its scope, the category's name and
-- the products it really covers at this moment (listed, in stock, and for a
-- price offer actually cheaper). An offer covering nothing is left out.
drop function if exists grocery_live_offers(text, double precision, double precision);
create function grocery_live_offers(p_pincode text, p_lat double precision default null, p_lng double precision default null)
returns table (
  id uuid, kind text, pct numeric, buy_qty int, free_qty int, min_order numeric, max_discount numeric, valid_days int, ends_at timestamptz,
  master_product_id uuid, name text, name_ta text, pack_size text, image_path text, card_bg text, mrp numeric, price numeric, was_price numeric,
  scope text, category_id uuid, category_name text, category_name_ta text, product_ids uuid[]
)
language sql stable security definer set search_path = public as $$
  select so.id, so.kind, so.pct, so.buy_qty, so.free_qty, so.min_order, so.max_discount, so.valid_days, so.ends_at,
         m.id, m.name, m.name_ta, m.pack_size, m.image_path, m.card_bg, coalesce(m.mrp, sp.mrp),
         case when so.scope = 'product' then pn.selling end, case when so.scope = 'product' then pn.was_price end,
         so.scope, so.category_id, cc.name, cc.name_ta, cov.ids
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
values ('0047', 'shop_offer_scope') on conflict (version) do nothing;
