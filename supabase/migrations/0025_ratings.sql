-- 0025: ratings after delivery — each product on the order, the rider, and the app.
-- One rating per order (upsert), only by the customer who ordered, only once delivered.
-- Aggregates are exposed through views so the app can show stars and counts
-- without reading anyone's notes.

create table order_ratings (
  order_id    uuid primary key references orders(id) on delete cascade,
  customer_id uuid not null references profiles(id),
  rider_id    uuid references delivery_partners(id),
  rider_stars smallint check (rider_stars between 1 and 5),
  rider_note  text check (rider_note is null or char_length(rider_note) <= 300),
  app_stars   smallint check (app_stars between 1 and 5),
  app_note    text check (app_note is null or char_length(app_note) <= 300),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index order_ratings_rider_idx on order_ratings (rider_id, created_at desc);

create table product_ratings (
  order_item_id uuid primary key references order_items(id) on delete cascade,
  order_id    uuid not null references orders(id) on delete cascade,
  product_id  uuid not null references products(id) on delete cascade,
  customer_id uuid not null references profiles(id),
  stars       smallint not null check (stars between 1 and 5),
  note        text check (note is null or char_length(note) <= 300),
  created_at  timestamptz not null default now()
);
create index product_ratings_product_idx on product_ratings (product_id, created_at desc);

alter table order_ratings enable row level security;
alter table product_ratings enable row level security;
create policy "own order ratings" on order_ratings for select using (customer_id = auth.uid() or is_admin());
create policy "own product ratings" on product_ratings for select using (customer_id = auth.uid() or is_admin());
grant select on order_ratings, product_ratings to authenticated;
grant all on order_ratings, product_ratings to service_role;

-- Stars, how many rated, and how many different customers have bought it (delivered orders).
create or replace view product_stats as
select p.id as product_id,
       r.avg_stars,
       coalesce(r.rating_count, 0) as rating_count,
       coalesce(b.customers, 0) as customers
  from products p
  left join (
    select product_id, round(avg(stars)::numeric, 1) as avg_stars, count(*) as rating_count
      from product_ratings group by product_id
  ) r on r.product_id = p.id
  left join (
    select oi.product_id, count(distinct o.customer_id) as customers
      from order_items oi join orders o on o.id = oi.order_id
     where o.status = 'DELIVERED' and not oi.unavailable
     group by oi.product_id
  ) b on b.product_id = p.id;
grant select on product_stats to anon, authenticated, service_role;

create or replace view rider_stats_public as
select rider_id, round(avg(rider_stars)::numeric, 1) as avg_stars, count(rider_stars) as rating_count
  from order_ratings where rider_id is not null group by rider_id;
grant select on rider_stats_public to authenticated, service_role;
