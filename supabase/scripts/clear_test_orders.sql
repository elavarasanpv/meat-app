-- Clears every test order and all that hangs off it, before live testing.
-- Keeps: customers, addresses, shops, riders, catalog, prices, offers,
-- delivery settings, headlines, broadcasts, printed label codes.
-- Run once in the Supabase SQL editor. All or nothing (one transaction).

begin;

-- Support: wallet credits, ticket chats, tickets.
delete from wallet_entries;
delete from ticket_messages;
delete from tickets;

-- Money and rider trips.
delete from payments;
delete from rider_location_points;
delete from trips;                       -- trip_stops go with it

-- Printed labels stay, just unlinked so they can be used again.
update labels set order_id = null, linked_at = null where order_id is not null;

-- Orders. Goes with them: items, status history, proofs, OTPs, shop
-- assignments, rider offers, delivery attempts, coupon uses, order ratings,
-- product ratings.
delete from orders;

-- Rider day books.
delete from cash_submissions;
delete from rider_shifts;
delete from rider_locations;
update delivery_partners set cash_balance = 0, is_online = false;

-- Admin activity log: only the order, support and cash lines.
delete from admin_actions
 where action like 'order.%' or action like 'support.%' or action like 'cash.%';

-- Order numbers start again from 0001.
alter sequence order_daily_seq restart with 1;

commit;

-- Check: the first row of numbers should all be 0, the second row untouched.
select 'cleared' as what,
       (select count(*) from orders)          as orders,
       (select count(*) from order_items)     as items,
       (select count(*) from order_ratings)   as order_ratings,
       (select count(*) from product_ratings) as product_ratings,
       (select count(*) from tickets)         as tickets,
       (select count(*) from wallet_entries)  as wallet,
       (select count(*) from trips)           as trips,
       (select count(*) from cash_submissions) as cash
union all
select 'kept',
       (select count(*) from profiles),
       (select count(*) from dealers),
       (select count(*) from delivery_partners),
       (select count(*) from products),
       (select count(*) from master_products),
       (select count(*) from offers),
       (select count(*) from addresses),
       (select count(*) from labels);
