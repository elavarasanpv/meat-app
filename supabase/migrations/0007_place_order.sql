-- Placing an order: one atomic function called by the API (service_role),
-- plus a customer-readable table for the delivery OTP.

-- ── Delivery OTP, readable only by the order's customer ─────────────────
-- orders.otp_hash is what the API verifies against; this plain copy is what
-- the customer sees in the app ("share this code with the rider").
create table order_otps (
  order_id uuid primary key references orders(id) on delete cascade,
  otp text not null,
  created_at timestamptz not null default now()
);
comment on table order_otps is 'Plain delivery OTP shown to the customer in the app. Riders/dealers never read this table.';

alter table order_otps enable row level security;
create policy "customer reads own otp" on order_otps for select using (
  exists (select 1 from orders o where o.id = order_id and o.customer_id = auth.uid())
);
grant select on order_otps to authenticated;
grant all on order_otps to service_role;

-- ── Slots are created on demand per (zone, window); one row per window ──
create unique index delivery_slots_zone_start_uidx on delivery_slots (zone_id, starts_at) nulls not distinct;

-- ── Atomic order creation ────────────────────────────────────────────────
-- p_items: [{ "product_id": uuid, "qty": number, "size": "small|medium|large"|null, "notes": text|null }]
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
begin
  -- the address must belong to the customer
  if not exists (select 1 from addresses where id = p_address and user_id = p_customer) then
    raise exception 'address not found' using errcode = 'P0002';
  end if;
  if p_slot_start <= now() then
    raise exception 'slot is in the past' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'no items' using errcode = 'P0001';
  end if;

  -- one slot row per window (single zone for v1)
  insert into delivery_slots (zone_id, starts_at, ends_at)
  values (null, p_slot_start, p_slot_end)
  on conflict (zone_id, starts_at) do update set ends_at = excluded.ends_at
  returning id into v_slot_id;

  -- estimate from current prices
  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from products where id = (v_item->>'product_id')::uuid and is_active;
    if not found then
      raise exception 'product % not available', v_item->>'product_id' using errcode = 'P0002';
    end if;
    v_qty := (v_item->>'qty')::numeric;
    if v_qty <= 0 or v_qty > 50 then
      raise exception 'bad quantity' using errcode = 'P0001';
    end if;
    v_items := v_items + round(v_product.base_price_per_kg * v_qty);
  end loop;
  v_delivery := case when v_items >= 499 then 0 else 20 end;

  v_display := 'MT-' || to_char(now() at time zone 'Asia/Kolkata', 'MMDD') || '-' || lpad(nextval('order_daily_seq')::text, 4, '0');

  insert into orders (display_id, customer_id, address_id, slot_id, status, payment_mode, payment_status, est_amount, otp_hash)
  values (v_display, p_customer, p_address, v_slot_id, 'PLACED', p_payment, 'pending', v_items + v_delivery, p_otp_hash)
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from products where id = (v_item->>'product_id')::uuid;
    insert into order_items (order_id, product_id, requested_kg, cut, size, unit_price_per_kg, notes)
    values (
      v_order_id,
      v_product.id,
      (v_item->>'qty')::numeric,          -- kg, or piece count for unit = piece
      coalesce(v_item->>'size', 'standard'),
      v_item->>'size',
      v_product.base_price_per_kg,
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

insert into supabase_migrations.schema_migrations (version, name)
values ('0007', 'place_order') on conflict (version) do nothing;
