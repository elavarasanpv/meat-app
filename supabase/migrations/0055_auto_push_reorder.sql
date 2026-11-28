-- 0055: "Order again" automatic push, and at most one automatic push per
-- customer per day.
--
--   reorder : on the same weekday as a delivered order one week ago, at
--             send_at: "Last Sunday you ordered Chicken curry cut. Get it
--             again today." {day} and {items} in the wording are filled in
--             per customer. Skipped when they already ordered today.
-- Every automatic push is now logged, and a customer who already got one
-- today gets no other automatic push that day.
--
-- Rollback:
--   drop function if exists auto_push_reorder(text[]);
--   delete from auto_pushes where kind = 'reorder';
--   alter table auto_pushes drop constraint auto_pushes_kind_check;
--   alter table auto_pushes add constraint auto_pushes_kind_check check (kind in ('salary_day', 'weekend', 'inactive'));
--   (then re-run auto_push_audience from 0054)

alter table auto_pushes drop constraint if exists auto_pushes_kind_check;
alter table auto_pushes add constraint auto_pushes_kind_check check (kind in ('salary_day', 'weekend', 'inactive', 'reorder'));

insert into auto_pushes (kind, title, body, title_ta, body_ta, send_at, audience) values
  ('reorder', 'Order again? 🛒', 'Last {day} you ordered {items}. Get it again today on Thanjoz Mart.',
   'மீண்டும் ஆர்டர் செய்யலாமா? 🛒', 'கடந்த {day} நீங்கள் {items} ஆர்டர் செய்தீர்கள். இன்றும் Thanjoz Mart-ல் பெறுங்கள்.', '09:00', 'ordered')
on conflict (kind) do nothing;

-- Start of today, Indian time.
create or replace function ist_today_start() returns timestamptz
language sql stable as $$
  select date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
$$;

-- Same as 0054, but nobody who already got an automatic push today.
create or replace function auto_push_audience(p_audience text, p_pincodes text[], p_inactive_days int)
returns table (user_id uuid)
language sql stable security definer set search_path = public as $$
  with c as (
    select p.id from profiles p
     where p.role = 'customer'
       and exists (select 1 from push_tokens t where t.profile_id = p.id)
       and not exists (select 1 from auto_push_log g where g.customer_id = p.id and g.sent_at >= ist_today_start())
       and (coalesce(cardinality(p_pincodes), 0) = 0
            or exists (select 1 from addresses a where a.user_id = p.id and a.archived_at is null and a.pincode = any (p_pincodes)))
  ), last as (
    select o.customer_id, max(o.created_at) as at
      from orders o join c on c.id = o.customer_id
     where o.status <> 'CANCELLED'
     group by o.customer_id
  )
  select c.id from c left join last l on l.customer_id = c.id
   where case
     when p_inactive_days is not null then
       l.at is not null and l.at < now() - make_interval(days => p_inactive_days)
       and not exists (select 1 from auto_push_log g where g.kind = 'inactive' and g.customer_id = c.id and g.sent_at > l.at)
     when p_audience = 'ordered' then l.at is not null
     when p_audience = 'never_ordered' then l.at is null
     else true
   end;
$$;

-- Customers with a delivered order placed on this weekday last week (Indian
-- dates), who have not ordered today and got no automatic push today. One row
-- per customer: their latest such order and what was in it.
create or replace function auto_push_reorder(p_pincodes text[])
returns table (user_id uuid, order_id uuid, names text[], names_ta text[])
language sql stable security definer set search_path = public as $$
  with c as (
    select p.id from profiles p
     where p.role = 'customer'
       and exists (select 1 from push_tokens t where t.profile_id = p.id)
       and not exists (select 1 from auto_push_log g where g.customer_id = p.id and g.sent_at >= ist_today_start())
       and not exists (select 1 from orders o where o.customer_id = p.id and o.created_at >= ist_today_start() and o.status <> 'CANCELLED')
       and (coalesce(cardinality(p_pincodes), 0) = 0
            or exists (select 1 from addresses a where a.user_id = p.id and a.archived_at is null and a.pincode = any (p_pincodes)))
  ), o as (
    select distinct on (o.customer_id) o.customer_id, o.id
      from orders o join c on c.id = o.customer_id
     where o.status = 'DELIVERED'
       and o.created_at >= ist_today_start() - interval '7 days'
       and o.created_at <  ist_today_start() - interval '6 days'
     order by o.customer_id, o.created_at desc
  )
  select o.customer_id, o.id,
         array_agg(coalesce(mp.name, pr.name) order by i.id) filter (where coalesce(mp.name, pr.name) is not null),
         array_agg(coalesce(mp.name_ta, pr.name_ta, mp.name, pr.name) order by i.id) filter (where coalesce(mp.name, pr.name) is not null)
    from o
    join order_items i on i.order_id = o.id and not coalesce(i.unavailable, false)
    left join products pr on pr.id = i.product_id
    left join master_products mp on mp.id = i.master_product_id
   group by o.customer_id, o.id;
$$;
revoke all on function auto_push_reorder(text[]) from public, anon, authenticated;
grant execute on function auto_push_reorder(text[]) to service_role;
revoke all on function auto_push_audience(text, text[], int) from public, anon, authenticated;
grant execute on function auto_push_audience(text, text[], int) to service_role;
