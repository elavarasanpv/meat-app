-- 0029: admin-set pricing.
--  • Selling price lives on products.base_price_per_kg (the default for every
--    pincode); product_prices holds per-pincode overrides where we price an
--    area differently.
--  • price_history records every selling-price and shop-cost change, for the
--    dashboard's "price changes" widget.
--  • create_order and add_order_items charge the pincode's price.

create table product_prices (
  product_id uuid not null references products(id) on delete cascade,
  pincode text not null,
  price_per_kg numeric(10,2) not null check (price_per_kg > 0),
  updated_at timestamptz not null default now(),
  primary key (product_id, pincode)
);
comment on table product_prices is 'Selling-price overrides per pincode; products.base_price_per_kg is the default';
alter table product_prices enable row level security;
create policy "prices are public" on product_prices for select using (true);
grant select on product_prices to anon, authenticated;
grant all on product_prices to service_role;

create table price_history (
  id bigint generated always as identity primary key,
  product_id uuid not null references products(id) on delete cascade,
  kind text not null check (kind in ('sell', 'shop')),
  pincode text,                                      -- sell changes: null = the default price
  dealer_id uuid references dealers(id),             -- shop-cost changes
  old_price numeric(10,2),
  new_price numeric(10,2) not null,
  changed_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
alter table price_history enable row level security;
grant all on price_history to service_role;

-- ── create_order: charge the delivery pincode's selling price ──
create or replace function create_order(
  p_customer    uuid,
  p_address     uuid,
  p_slot_start  timestamptz,
  p_slot_end    timestamptz,
  p_payment     payment_mode,
  p_items       jsonb,
  p_otp_hash    text,
  p_otp         text
) returns table (order_id uuid, display_id text, est_amount numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id   uuid;
  v_display    text;
  v_slot_id    uuid;
  v_items      numeric := 0;
  v_delivery   numeric;
  v_item       jsonb;
  v_product    products%rowtype;
  v_qty        numeric;
  v_pincode    text;
  v_sell       numeric;
begin
  select pincode into v_pincode from addresses where id = p_address and user_id = p_customer;
  if v_pincode is null then
    raise exception 'address not found' using errcode = 'P0002';
  end if;
  if p_slot_start <= now() then
    raise exception 'slot is in the past' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'no items' using errcode = 'P0001';
  end if;

  insert into delivery_slots (zone_id, starts_at, ends_at)
  values (null, p_slot_start, p_slot_end)
  on conflict (zone_id, starts_at) do update set ends_at = excluded.ends_at
  returning id into v_slot_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from products where id = (v_item->>'product_id')::uuid and is_active;
    if not found then
      raise exception 'product % not available', v_item->>'product_id' using errcode = 'P0002';
    end if;
    v_qty := (v_item->>'qty')::numeric;
    if v_qty <= 0 or v_qty > 50 then
      raise exception 'bad quantity' using errcode = 'P0001';
    end if;
    select price_per_kg into v_sell from product_prices where product_id = v_product.id and pincode = v_pincode;
    v_items := v_items + round(coalesce(v_sell, v_product.base_price_per_kg) * v_qty);
  end loop;
  v_delivery := case when v_items >= 499 then 0 else 20 end;

  v_display := 'MT-' || to_char(now() at time zone 'Asia/Kolkata', 'MMDD') || '-' || lpad(nextval('order_daily_seq')::text, 4, '0');

  insert into orders (display_id, customer_id, address_id, slot_id, status, payment_mode, payment_status, est_amount, otp_hash)
  values (v_display, p_customer, p_address, v_slot_id, 'PLACED', p_payment, 'pending', v_items + v_delivery, p_otp_hash)
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from products where id = (v_item->>'product_id')::uuid;
    select price_per_kg into v_sell from product_prices where product_id = v_product.id and pincode = v_pincode;
    insert into order_items (order_id, product_id, requested_kg, cut, size, unit_price_per_kg, notes)
    values (
      v_order_id,
      v_product.id,
      (v_item->>'qty')::numeric,
      coalesce(v_item->>'size', 'standard'),
      v_item->>'size',
      coalesce(v_sell, v_product.base_price_per_kg),
      nullif(v_item->>'notes', '')
    );
  end loop;

  insert into order_status_history (order_id, from_status, to_status, actor_id, note)
  values (v_order_id, null, 'PLACED', p_customer, 'Order placed from app');

  insert into order_otps (order_id, otp) values (v_order_id, p_otp);

  return query select v_order_id, v_display, v_items + v_delivery;
end;
$$;
revoke all on function create_order(uuid, uuid, timestamptz, timestamptz, payment_mode, jsonb, text, text) from public, anon, authenticated;
grant execute on function create_order(uuid, uuid, timestamptz, timestamptz, payment_mode, jsonb, text, text) to service_role;

-- ── add_order_items: same pincode pricing when adding to a placed order ──
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
  v_pincode   text;
  v_sell      numeric;
begin
  select o.status, o.customer_id, coalesce(o.discount_amount, 0), a.pincode
    into v_status, v_customer, v_discount, v_pincode
    from orders o join addresses a on a.id = o.address_id
   where o.id = p_order for update of o;
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

    select id into v_line from order_items
     where order_id = p_order and product_id = v_product.id and not unavailable
       and coalesce(size, '') = coalesce(v_item->>'size', '')
     limit 1;
    if found then
      update order_items set requested_kg = least(50, requested_kg + v_qty) where id = v_line;
    else
      select price_per_kg into v_sell from product_prices where product_id = v_product.id and pincode = v_pincode;
      insert into order_items (order_id, product_id, requested_kg, cut, size, unit_price_per_kg, notes)
      values (p_order, v_product.id, v_qty, coalesce(v_item->>'size', 'standard'), v_item->>'size', coalesce(v_sell, v_product.base_price_per_kg), nullif(v_item->>'notes', ''));
    end if;
    v_added := v_added + 1;
  end loop;

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
values ('0029', 'pricing') on conflict (version) do nothing;
