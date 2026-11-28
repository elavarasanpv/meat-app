-- 0049: a buy-and-get-free offer on many products can count the basket two ways.
--
--   mix = false : each product on its own. Buy 3 of one product, get 1 more of it free.
--   mix = true  : any mix. Buy any 3 of the offer's products, get 1 free
--                 (one more of the lowest-priced of them in the basket).
--
-- The customer lists say which, so the card can read "Buy any 3".
--
-- Roll back:
--   re-run the grocery_catalog block of 0047 and the grocery_live_offers block of 0048
--   (drop each function first), then
--   alter table shop_offers drop column mix;

alter table shop_offers add column if not exists mix boolean not null default false;

-- ───────────────────────── grocery list for an address (with offers) ─────────────────────────
-- As 0047, plus whether the product's buy-and-get-free offer counts any mix.
drop function if exists grocery_catalog(text, double precision, double precision);
create function grocery_catalog(p_pincode text, p_lat double precision default null, p_lng double precision default null)
returns table (
  master_product_id uuid, name text, name_ta text, brand text, pack_size text,
  unit text, min_qty numeric, qty_step numeric, image_path text, category_id uuid,
  selling_price numeric, mrp numeric, in_stock boolean, shops bigint, card_bg text,
  offer_pct numeric, bogo_buy int, bogo_free int, bogo_mix boolean
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
    select distinct on (l.master_product_id) l.master_product_id, so.buy_qty, so.free_qty, so.mix
      from live l
      join shop_offers so on so.dealer_id = l.dealer_id and so.kind = 'bogo'
       and so.status = 'approved' and so.is_active and so.starts_at <= now() and so.ends_at > now()
       and shop_offer_covers(so, l.master_product_id)
     where l.ok
     order by l.master_product_id, so.free_qty::numeric / so.buy_qty desc
  )
  select m.id, m.name, m.name_ta, m.brand, m.pack_size, m.unit, m.min_qty, m.qty_step, m.image_path, m.category_id,
         b.selling_price, coalesce(m.mrp, b.mrp), b.in_stock, b.shops, m.card_bg,
         b.offer_pct, g.buy_qty, g.free_qty, coalesce(g.mix, false)
    from best b
    join master_products m on m.id = b.master_product_id
    left join bogo g on g.master_product_id = b.master_product_id
   where m.is_active and m.status <> 'rejected'
   order by m.name
$$;
revoke all on function grocery_catalog(text, double precision, double precision) from public, anon;
grant execute on function grocery_catalog(text, double precision, double precision) to authenticated, service_role;

-- ───────────────────────── live offers near an address ─────────────────────────
-- As 0048, plus the mix flag.
drop function if exists grocery_live_offers(text, double precision, double precision);
create function grocery_live_offers(p_pincode text, p_lat double precision default null, p_lng double precision default null)
returns table (
  id uuid, kind text, pct numeric, buy_qty int, free_qty int, min_order numeric, max_discount numeric, valid_days int, ends_at timestamptz,
  master_product_id uuid, name text, name_ta text, pack_size text, image_path text, card_bg text, mrp numeric, price numeric, was_price numeric,
  scope text, category_id uuid, category_name text, category_name_ta text, product_ids uuid[], banner_path text, mix boolean
)
language sql stable security definer set search_path = public as $$
  select so.id, so.kind, so.pct, so.buy_qty, so.free_qty, so.min_order, so.max_discount, so.valid_days, so.ends_at,
         m.id, m.name, m.name_ta, m.pack_size, m.image_path, m.card_bg, coalesce(m.mrp, sp.mrp),
         case when so.scope = 'product' then pn.selling end, case when so.scope = 'product' then pn.was_price end,
         so.scope, so.category_id, cc.name, cc.name_ta, cov.ids, so.banner_path, so.mix
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
values ('0049', 'shop_offer_bogo_mix') on conflict (version) do nothing;
