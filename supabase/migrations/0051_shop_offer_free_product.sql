-- 0051: an any-mix buy-and-get-free offer names the product it gives free.
--
--   free_product_id : the product handed over free when the offer counts any
--                     mix of its products. Empty (older offers, or the shop is
--                     out of it): more of the lowest-priced product bought.
--                     A same-product offer always gives more of that product.
--
-- Roll back:
--   re-run the grocery_live_offers block of 0050 (drop the function first), then
--   alter table shop_offers drop column free_product_id;

alter table shop_offers
  add column if not exists free_product_id uuid references master_products(id) on delete set null;

-- ───────────────────────── live offers near an address ─────────────────────────
-- As 0050, plus the free product of an any-mix offer.
drop function if exists grocery_live_offers(text, double precision, double precision);
create function grocery_live_offers(p_pincode text, p_lat double precision default null, p_lng double precision default null)
returns table (
  id uuid, kind text, pct numeric, buy_qty int, free_qty int, min_order numeric, max_discount numeric, valid_days int, ends_at timestamptz,
  master_product_id uuid, name text, name_ta text, pack_size text, image_path text, card_bg text, mrp numeric, price numeric, was_price numeric,
  scope text, category_id uuid, category_name text, category_name_ta text, product_ids uuid[], banner_path text, mix boolean, color text,
  free_product_id uuid, free_name text, free_name_ta text
)
language sql stable security definer set search_path = public as $$
  select so.id, so.kind, so.pct, so.buy_qty, so.free_qty, so.min_order, so.max_discount, so.valid_days, so.ends_at,
         m.id, m.name, m.name_ta, m.pack_size, m.image_path, m.card_bg, coalesce(m.mrp, sp.mrp),
         case when so.scope = 'product' then pn.selling end, case when so.scope = 'product' then pn.was_price end,
         so.scope, so.category_id, cc.name, cc.name_ta, cov.ids, so.banner_path, so.mix, so.color,
         fm.id, fm.name, fm.name_ta
    from shop_offers so
    join dealers d on d.id = so.dealer_id and d.is_active and d.store_type = 'grocery'
     and d.is_open and (d.closed_until is null or d.closed_until <= now())
    left join master_products m on m.id = so.master_product_id
    left join store_products sp on sp.dealer_id = so.dealer_id and sp.master_product_id = so.master_product_id
    left join lateral store_price_now(sp.dealer_id, sp.master_product_id, sp.selling_price, sp.shop_price, sp.mrp) pn on sp.dealer_id is not null
    left join catalog_categories cc on cc.id = so.category_id
    left join master_products fm on fm.id = so.free_product_id and so.kind = 'bogo' and so.mix
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
values ('0051', 'shop_offer_free_product') on conflict (version) do nothing;
