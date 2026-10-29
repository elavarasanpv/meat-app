// DEV ONLY — create/refresh a test dealer so the assignment engine and the
// dealer API can be exercised before the admin panel exists.
//
//   node --env-file=.env scripts/seed-dealer.mjs [phone]
//
// Links the dealer to the profile of the given phone (default the test
// customer +919999999999 — dev data only), serves the three launch pincodes,
// stocks every active product at a shop price 12% below the selling price,
// and opens the shop.

import { createClient } from "@supabase/supabase-js";

const phone = (process.argv[2] ?? "919999999999").replace(/^\+/, "");
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: profile } = await admin.from("profiles").select("id, full_name").eq("phone", phone).maybeSingle();
if (!profile) throw new Error(`no profile with phone ${phone} — log in once first`);

let { data: dealer } = await admin.from("dealers").select("id").eq("profile_id", profile.id).maybeSingle();
if (!dealer) {
  const ins = await admin
    .from("dealers")
    .insert({ profile_id: profile.id, shop_name: "Chettikulam Test Shop", lat: 8.256, lng: 77.666 })
    .select("id")
    .single();
  if (ins.error) throw ins.error;
  dealer = ins.data;
  console.log("• created dealer", dealer.id);
}

await admin.from("dealers").update({ is_open: true, is_active: true, closed_until: null, lat: 8.256, lng: 77.666 }).eq("id", dealer.id);

for (const pincode of ["627120", "627106", "629401"]) {
  await admin.from("dealer_pincodes").upsert({ dealer_id: dealer.id, pincode });
}

const { data: products } = await admin.from("products").select("id, name, base_price_per_kg").eq("is_active", true);
for (const p of products ?? []) {
  const shopPrice = Math.round(Number(p.base_price_per_kg) * 0.88);
  await admin.from("dealer_products").upsert({ dealer_id: dealer.id, product_id: p.id, price_per_kg: shopPrice, out_of_stock_until: null });
}
console.log(`✔ dealer ${dealer.id} open, serving 3 pincodes, stocking ${products?.length ?? 0} products at 88% of selling price`);
