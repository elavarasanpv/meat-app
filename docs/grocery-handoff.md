# Grocery vertical: handoff (2026-11-19)

Read this first in a new chat, then [grocery-g1.md](grocery-g1.md) and [grocery-g2.md](grocery-g2.md).

## The idea
FreshCut (rural meat delivery) gets a **grocery vertical**, shipped dormant and switched on later.
- **One platform. `store_type` is data.** There's no separate app or schema per vertical: `dealers.store_type` is `meat` or `grocery`, and the `verticals` table holds the on/off switch (`meat` on, `grocery` off).
- **Separate catalog tables** (`catalog_categories`, `master_products`, `store_products`). The meat customer app reads `categories`/`products` with no vertical filter, so putting grocery items there would leak them into the meat home screen.
- **Two prices per listing:** `shop_price ≤ selling_price ≤ MRP`, enforced by a DB CHECK. The shop is paid `shop_price` and the customer pays `selling_price`; the gap is platform revenue. `price_mode` is `same` or `custom`. When admin sets the selling price, `selling_set_by='admin'` locks it. Any discount below the shop price must go through `offers`, never the listing price.
- **The revenue floor is the delivery fee**, read from `delivery_fee_rules`. The seeded grocery rule is min order ₹99, fee ₹20, free at ₹499 and above. Meat keeps its hard-coded fee: free at ₹499 and above, ₹20 otherwise.
- **Approval:** listing an existing master item needs no approval. Only a *new* master item goes to the queue (pending → approved, keep store-only, or rejected). A pending item can already be sold by the shop that added it. Barcodes are unique; names are matched with trigram similarity.
- **One order comes from one shop**, and for grocery the customer picks the shop.
- **Going live is a data change:** RLS and the definer-rights functions all check `vertical_is_active('grocery')`, so no app release is needed to switch it on.

## Status
| Phase | What | State |
|---|---|---|
| G1 | Catalog model, approval queue, CSV imports, admin **Catalog** page, Shops "What the shop sells" | Committed `ef41abe`; migration **0030 applied in prod** |
| G2 | Ordering: `create_grocery_order`, `POST /orders/grocery`, customer `/grocery` + `/grocery/[storeId]`, grocery basket/bill/checkout/orders | Written and scratch-tested (11 cases pass); **uncommitted**; migration **0031 not applied** |
| G3 | Partner app grocery screens (pack without label/scale photo, My catalog, scan, custom add, substitutions), settlement by `shop_unit_price`, offers on grocery, master seeding (Open Food Facts) | Not started |

**Do not switch grocery on before G3 ships.** Until then a grocery shop would see orders in the meat order card, with "pieces" shown for packs.

## Immediate next steps
1. Run `supabase/migrations/0031_grocery_g2_orders.sql` in the Supabase SQL editor.
2. Commit G2 (25 changed/new files, listed below).
3. Visual check: the admin Catalog page and the Shops store-type field (`pnpm --filter admin exec vite --port 5177`, then sign in as admin), and the customer grocery screens in Expo (needs a grocery shop and the flag on in a test env).
4. Start G3.

## G2 files (uncommitted)
- DB: `supabase/migrations/0031_grocery_g2_orders.sql`
  - adds `orders.vertical_type` (default `meat`)
  - adds `order_items.master_product_id` and `order_items.shop_unit_price`; `product_id` becomes nullable, with CHECK `order_items_one_product`
  - adds `create_grocery_order()`, `grocery_stores(pincode)`, `grocery_fee(pincode)`, `master_listed_live()`, and a widened `master_products` read policy
- Shared: `placeGroceryOrderSchema` in `packages/shared/src/schemas.ts`
- API:
  - `orders.controller.ts`: `POST /orders/grocery`
  - `orders.service.ts`: `placeGroceryOrder`
  - `dealer/assignment.service.ts`: `offerTo()`. On timeout, a grocery order re-rings the same shop up to 3 times.
  - `orders/item-shape.ts`: `withProductShapes()` fills `products` from `master_products`. It's used in `dealer.service.ts`, `rider.service.ts` and `admin-ops.service.ts`.
- Customer:
  - `src/hooks/useGrocery.ts`
  - `app/grocery/index.tsx` and `app/grocery/[storeId].tsx`
  - `src/store/cart.ts`: adds `vertical`, `dealerId`, `step`, `minQty`, `mrp`, `imagePath`, a `feeRule` in the store, `cartVertical()`, `basketConflict()`, and a grocery-aware `cartTotals()`
  - `BillSummary.tsx`: fee rule, no coupons on grocery, below-minimum warning
  - `checkout.tsx` (sends grocery baskets to the grocery endpoint), `orders.tsx` (Order again for grocery), `useOrders.ts` (`master_products` embed, `normaliseItems`, query key `v3`, `usePlaceGroceryOrder`), `CartBar.tsx`, `cart.tsx`, `images.ts` (`groceryImage`, `cartImage`), `useOffers.ts` (quote now takes an `enabled` flag), `_layout.tsx` (routes)
  - Home (`(tabs)/index.tsx`): Meat/Grocery switch, shown only when the vertical is live
  - i18n: new keys in `en.ts` and `ta.ts`
- Docs: `docs/grocery-g2.md`

## Gotchas
- **Customers can't see `dealers` rows.** RLS on `dealers` only shows each user their own row, so customers see none. An inline `exists(select … from dealers)` inside another policy is therefore always false for them. Use `security definer` helpers instead: `my_dealer_id`, `my_store_type`, `dealer_sells_live_vertical`, `grocery_stores`, `master_listed_live`.
- **Grocery lines have no `product_id`.** Every order read embeds `products(...)`, so also select `master_products(...)` and normalise: `withProductShapes()` in the API, `normaliseItems` in the customer `useOrders`.
- **`@thanjozmart/shared` resolves to `./dist`.** Run `pnpm --filter @thanjozmart/shared build` after editing schemas, or the typecheck checks against stale types.
- **The local API isn't in watch mode.** It runs `node --env-file=.env dist/main.js` from `apps/api`. After changes, run `pnpm --filter api build` and restart it.
- **Use Node 24** (`nvm use 24`). Admin dev runs on port 5177, because 5173 is taken by PaperHint web.
- **Route clash risk:** `@Controller("admin/catalog")` sits next to the meat `GET /admin/catalog`. Never add a bare `@Get()` to the catalog controller.
- **supabase-js typing:** complex selects come back typed as `GenericStringError`, so `.map()` callbacks need an `unknown` parameter.
- **Migrations are hand-run** in the SQL editor. Each ends with a footer: `insert into supabase_migrations.schema_migrations (version, name) values ('00NN','name') on conflict do nothing`.
- **Scratch test without Docker:**
  1. Start Postgres: `LC_ALL=en_US.UTF-8 /opt/homebrew/opt/postgresql@18/bin/pg_ctl -D /opt/homebrew/var/postgresql@18 -o "-p 5433" start`
  2. Load shims for:
     - the roles `anon`, `authenticated` and `service_role` (`service_role` with bypassrls)
     - `auth.users` and `auth.uid()`
     - `storage.buckets`, `storage.objects` and `storage.foldername`
     - `supabase_migrations.schema_migrations`
     - the publication `supabase_realtime`
  3. Replay every migration, then `supabase/seed.sql`. The seed-dependent migrations 0004, 0005, 0008 and 0011 fail on data FKs; that's harmless.
  4. Act as a user: `set role authenticated; select set_config('request.jwt.claim.sub','<uuid>',false)`.

## Working rules
- Commit or push only when the user says so.
- After a migration is pasted into the SQL editor, wait for the user to say "ran".
- Push with: `git -c credential.helper='!gh auth git-credential' push origin main`.
- Check UI changes in the browser.
