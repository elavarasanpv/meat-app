// DEV ONLY — walk a fresh order through the whole dealer flow against the
// local API: place → auto-offer → dealer accepts (ready 30 min) → start
// cutting → weigh every item → packed (final bill).
//
//   node --env-file=.env scripts/test-dealer-flow.mjs

import { createClient } from "@supabase/supabase-js";

const API = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 3001}`;
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });

// Test login (the same profile is customer and test dealer — dev only)
await anon.auth.signInWithOtp({ phone: "+919999999999" });
const { data: session, error: loginErr } = await anon.auth.verifyOtp({ phone: "+919999999999", token: "123456", type: "sms" });
if (loginErr) throw loginErr;
const token = session.session.access_token;
const call = async (method, path, body) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return json;
};

// Ingredients: an address + two products + a slot
const { data: addr } = await admin.from("addresses").select("id, pincode").is("archived_at", null).limit(1).single();
const { data: products } = await admin.from("products").select("id, name, unit").eq("is_active", true).limit(2);
const slots = await call("GET", "/orders/slots");

console.log("1) placing order…");
const placed = await call("POST", "/orders", {
  addressId: addr.id,
  slot: { startsAt: slots[0].startsAt, endsAt: slots[0].endsAt },
  paymentMode: "cod",
  items: products.map((p) => ({ productId: p.id, qty: p.unit === "piece" ? 6 : 1 })),
});
console.log("   placed", placed.displayId, "est ₹" + placed.estAmount);

const { data: afterPlace } = await admin.from("orders").select("status, dealer_id").eq("id", placed.orderId).single();
console.log("2) after auto-offer:", afterPlace.status, "dealer:", afterPlace.dealer_id ? "assigned" : "none");

const inbox = await call("GET", "/dealer/orders");
const mine = inbox.find((o) => o.id === placed.orderId);
console.log("3) dealer inbox has it:", !!mine, "deadline:", mine?.accept_deadline);

const accepted = await call("POST", "/dealer/orders/accept", { orderId: placed.orderId, readyMinutes: 30 });
console.log("4) accepted, ready by", accepted.readyBy);

await call("POST", `/dealer/orders/${placed.orderId}/start-cutting`);
console.log("5) cutting started (status PACKING)");

for (const it of mine.order_items) {
  const qty = Number(it.requested_kg);
  await call("POST", "/dealer/orders/weigh", { orderId: placed.orderId, orderItemId: it.id, actualQty: qty * 1.04 });
  console.log(`6) weighed ${it.products.name}: ${(qty * 1.04).toFixed(2)}`);
}

const packed = await call("POST", `/dealer/orders/${placed.orderId}/packed`);
console.log("7) packed — final ₹" + packed.finalAmount);

const { data: fin } = await admin.from("orders").select("status, ready_by, final_amount").eq("id", placed.orderId).single();
const { data: hist } = await admin.from("order_status_history").select("to_status").eq("order_id", placed.orderId).order("id");
console.log("✔ order:", fin.status, "| history:", hist.map((h) => h.to_status).join(" → "));
console.log("  (cleaning up: cancelling the test order)");
await admin.from("orders").update({ status: "CANCELLED", cancel_reason: "dev test" }).eq("id", placed.orderId);
