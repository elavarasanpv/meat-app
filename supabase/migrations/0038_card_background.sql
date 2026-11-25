-- 0038 — backdrop behind a grocery product photo
--
-- The single green wash made green and white packets melt into the card. The
-- admin now picks one of four near-white backdrops per product; the customer
-- app reads it from grocery_catalog.
--
-- Rollback:
--   (re-run the grocery_catalog block of 0032)
--   alter table master_products drop column if exists card_bg;
--   delete from supabase_migrations.schema_migrations where version = '0038';

alter table master_products add column if not exists card_bg text not null default 'green'
  check (card_bg in ('white', 'green', 'grey', 'cream'));
comment on column master_products.card_bg is 'Backdrop behind the product photo on the customer card: white, green, grey or cream';

-- The return type gains card_bg, so the function is dropped and made again.
drop function if exists grocery_catalog(text);
create function grocery_catalog(p_pincode text)
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
         b.selling_price, coalesce(m.mrp, b.mrp), b.in_stock, b.shops, m.card_bg
    from best b
    join master_products m on m.id = b.master_product_id
   where m.is_active and m.status <> 'rejected'
   order by m.name
$$;
revoke all on function grocery_catalog(text) from public, anon;
grant execute on function grocery_catalog(text) to authenticated, service_role;
