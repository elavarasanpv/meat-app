-- App charge: what a shop gives Thanjoz Mart for each order it gets through the app.
-- It comes off the shop's amount; the customer never pays it and never sees it.
-- A shop that sells at its own price (customer price = shop price) still pays it,
-- so every order earns the app something.
--
-- The default lives on the vertical (grocery today); a shop can have its own value.
-- The charge is saved on the order when the shop accepts it, so a later change to
-- the rule never changes an order already taken.

alter table verticals
  add column if not exists app_charge_mode  text not null default 'none',
  add column if not exists app_charge_value numeric(10,2) not null default 0;

alter table verticals drop constraint if exists verticals_app_charge_ck;
alter table verticals add constraint verticals_app_charge_ck check (
  app_charge_mode in ('none', 'percent', 'flat')
  and app_charge_value >= 0
  and (app_charge_mode <> 'percent' or app_charge_value <= 100)
);

-- null mode = use the vertical's default
alter table dealers
  add column if not exists app_charge_mode  text,
  add column if not exists app_charge_value numeric(10,2);

alter table dealers drop constraint if exists dealers_app_charge_ck;
alter table dealers add constraint dealers_app_charge_ck check (
  app_charge_mode is null
  or (
    app_charge_mode in ('none', 'percent', 'flat')
    and app_charge_value is not null
    and app_charge_value >= 0
    and (app_charge_mode <> 'percent' or app_charge_value <= 100)
  )
);

alter table orders
  add column if not exists app_charge       numeric(10,2),  -- ₹ the shop gives the app for this order
  add column if not exists app_charge_basis text;           -- the rule used, e.g. '3%' or '₹10'

comment on column orders.app_charge is 'What the shop gives Thanjoz Mart for this order (off the shop amount, not paid by the customer). Saved when the shop accepts.';
