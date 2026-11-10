-- 0023: one atomic step for every order status change.
-- Locks the order, checks it is still in the status the caller saw, moves it,
-- and writes the history line together. If someone else changed the order
-- first, it raises FC409 instead of silently doing nothing.
-- Which moves are allowed (PLACED → DEALER_ASSIGNED …) stays in the API's
-- canTransition(); this function only guarantees the change is all-or-nothing.

create or replace function transition_order(
  p_order    uuid,
  p_expected order_status,
  p_to       order_status,
  p_actor    uuid,
  p_note     text default null,
  p_lat      double precision default null,
  p_lng      double precision default null,
  p_rider    uuid default null -- set when a rider claims the order; it must be unclaimed
) returns order_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status order_status;
  v_rider  uuid;
begin
  select status, rider_id into v_status, v_rider from orders where id = p_order for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if v_status <> p_expected or (p_rider is not null and v_rider is not null) then
    raise exception 'This order was just updated by someone else' using errcode = 'FC409';
  end if;

  update orders
     set status = p_to,
         rider_id = coalesce(p_rider, rider_id)
   where id = p_order;

  insert into order_status_history (order_id, from_status, to_status, actor_id, note, lat, lng)
  values (p_order, v_status, p_to, p_actor, p_note, p_lat, p_lng);

  return v_status;
end;
$$;

revoke all on function transition_order(uuid, order_status, order_status, uuid, text, double precision, double precision, uuid) from public;
grant execute on function transition_order(uuid, order_status, order_status, uuid, text, double precision, double precision, uuid) to service_role;
