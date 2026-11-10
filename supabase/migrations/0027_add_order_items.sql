-- 0027: the customer can add items to an order until the shop accepts it.
-- Takes the same row lock as transition_order, so an add and the shop's
-- accept never interleave: whichever gets the lock first wins, and the other
-- either sees the new items or gets FC409 ("shop already started").

alter table orders add column if not exists items_added_at timestamptz;
comment on column orders.items_added_at is 'Last time the customer added items after placing (shows the shop the order changed)';

create or replace function add_order_items(
  p_order    uuid,
  p_customer uuid,
  p_items    jsonb
) returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status    order_status;
  v_customer  uuid;
  v_discount  numeric;
  v_item      jsonb;
  v_product   products%rowtype;
  v_qty       numeric;
  v_line      uuid;
  v_items     numeric;
  v_est       numeric;
  v_added     int := 0;
begin
  select status, customer_id, coalesce(discount_amount, 0)
    into v_status, v_customer, v_discount
    from orders where id = p_order for update;
  if not found or v_customer <> p_customer then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if v_status not in ('PLACED', 'DEALER_ASSIGNED') then
    raise exception 'The shop has already started on this order' using errcode = 'FC409';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'no items' using errcode = 'P0001';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from products where id = (v_item->>'product_id')::uuid and is_active;
    if not found then
      raise exception 'product % not available', v_item->>'product_id' using errcode = 'P0002';
    end if;
    v_qty := (v_item->>'qty')::numeric;
    if v_qty <= 0 or v_qty > 50 then
      raise exception 'bad quantity' using errcode = 'P0001';
    end if;

    -- same product and size already on the order: top up that line instead of a second row
    select id into v_line from order_items
     where order_id = p_order and product_id = v_product.id and not unavailable
       and coalesce(size, '') = coalesce(v_item->>'size', '')
     limit 1;
    if found then
      update order_items set requested_kg = least(50, requested_kg + v_qty) where id = v_line;
    else
      insert into order_items (order_id, product_id, requested_kg, cut, size, unit_price_per_kg, notes)
      values (p_order, v_product.id, v_qty, coalesce(v_item->>'size', 'standard'), v_item->>'size', v_product.base_price_per_kg, nullif(v_item->>'notes', ''));
    end if;
    v_added := v_added + 1;
  end loop;

  -- same estimate rule as create_order; the offer already applied stays as it was
  select coalesce(sum(round(unit_price_per_kg * requested_kg)), 0) into v_items
    from order_items where order_id = p_order and not unavailable;
  v_est := greatest(0, v_items - v_discount) + case when v_items >= 499 then 0 else 20 end;

  update orders set est_amount = v_est, items_added_at = now() where id = p_order;
  insert into order_status_history (order_id, from_status, to_status, actor_id, note)
  values (p_order, v_status, v_status, p_customer, 'customer added ' || v_added || ' item(s)');

  return v_est;
end;
$$;

revoke all on function add_order_items(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function add_order_items(uuid, uuid, jsonb) to service_role;

insert into supabase_migrations.schema_migrations (version, name)
values ('0027', 'add_order_items') on conflict (version) do nothing;
