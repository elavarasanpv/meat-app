-- 0016: storage for photos.
--  • order-proofs (private): the shop's photo of each packed item on the
--    weighing scale, stored as <order_id>/<order_item_id>-<time>.jpg.
--    The shop of that order may upload and view; the customer may view.
--  • product-images (public): catalogue pictures (admin uploads via the API).
-- Billing note: the customer pays exactly the price shown at checkout; the
-- photo on the scale is the shop's proof that at least that weight was packed.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('order-proofs', 'order-proofs', false, 1048576, array['image/jpeg', 'image/png', 'image/webp']),
  ('product-images', 'product-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- The shop assigned to the order (first path segment = order id) may upload.
create policy "shop uploads proof for own order" on storage.objects for insert to authenticated
with check (
  bucket_id = 'order-proofs'
  and (storage.foldername(name))[1]::uuid in (
    select o.id from orders o join dealers d on d.id = o.dealer_id where d.profile_id = auth.uid()
  )
);

-- The shop and the customer of the order (and admins) may view its proofs.
create policy "order parties view proofs" on storage.objects for select to authenticated
using (
  bucket_id = 'order-proofs'
  and (
    (storage.foldername(name))[1]::uuid in (
      select o.id from orders o
      left join dealers d on d.id = o.dealer_id
      where d.profile_id = auth.uid() or o.customer_id = auth.uid()
    )
    or is_admin()
  )
);

-- Retake: the shop may replace its own upload while the order is still with it.
create policy "shop replaces own proof" on storage.objects for update to authenticated
using (bucket_id = 'order-proofs' and owner = auth.uid())
with check (bucket_id = 'order-proofs' and owner = auth.uid());

-- One proof row per item: lets the API know which items are photographed.
alter table order_proofs add column if not exists order_item_id uuid references order_items(id) on delete cascade;
create index if not exists order_proofs_item_idx on order_proofs(order_item_id);
