// DEV ONLY — simulate a rider delivering an order so the customer app's
// tracking card can be tested without a real rider app.
//
//   node --env-file=.env scripts/simulate-ride.mjs MT-1022-0001 [--interval 5] [--reset]
//
// What it does (against your Supabase project, using the service role):
//  1. Links a "test rider" to the order. For lack of a separate rider account it
//     uses the order's own customer profile as the rider (dev data only).
//  2. Sets a home pin on the order's address if it has none, and a pickup point.
//  3. Moves the order to OUT_FOR_DELIVERY (bypassing the state machine — dev only).
//  4. Logs in as the test phone (+919999999999 / 123456) and POSTs positions to the
//     real API endpoint POST /rider/location, walking from the shop to the home.
// --reset puts the order back to PLACED and removes the rider link.

import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const displayId = args.find((a) => !a.startsWith("--"));
const intervalSec = Number(args[args.indexOf("--interval") + 1]) || 5;
const reset = args.includes("--reset");
const arriveOnly = args.includes("--arrive");
if (!displayId) {
  console.error("usage: node --env-file=.env scripts/simulate-ride.mjs <DISPLAY_ID> [--interval 5] [--reset]");
  process.exit(1);
}

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const API = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 3001}`;
const TEST_PHONE = "+919999999999";
const TEST_OTP = "123456";

// Kallakurichi: shop on the north-west side, home near the Govt school.
const PICKUP = { lat: 11.756, lng: 78.9405 };
const HOME = { lat: 11.7383, lng: 78.9594 };
const STEPS = 24;

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

const { data: order, error: oErr } = await admin
  .from("orders")
  .select("id, status, customer_id, address_id, rider_id")
  .eq("display_id", displayId)
  .single();
if (oErr || !order) throw new Error(`order ${displayId} not found: ${oErr?.message}`);

if (reset) {
  await admin.from("orders").update({ status: "PLACED", rider_id: null, pickup_lat: null, pickup_lng: null, arrived_at: null }).eq("id", order.id);
  await admin.from("order_status_history").delete().eq("order_id", order.id).neq("to_status", "PLACED");
  if (order.rider_id) await admin.from("rider_locations").delete().eq("rider_id", order.rider_id);
  console.log(`↺ ${displayId} reset to PLACED`);
  process.exit(0);
}

// 1. test rider = the customer's own profile (dev only)
let { data: rider } = await admin.from("delivery_partners").select("id").eq("profile_id", order.customer_id).maybeSingle();
if (!rider) {
  const ins = await admin.from("delivery_partners").insert({ profile_id: order.customer_id, vehicle: "TEST bike", is_online: true }).select("id").single();
  if (ins.error) throw ins.error;
  rider = ins.data;
  console.log("• created test rider linked to the customer's profile");
}

// 2. home pin + pickup point
const { data: addr } = await admin.from("addresses").select("lat, lng").eq("id", order.address_id).single();
const home = addr?.lat != null && addr?.lng != null ? { lat: addr.lat, lng: addr.lng } : HOME;
if (addr?.lat == null) {
  await admin.from("addresses").update({ lat: HOME.lat, lng: HOME.lng }).eq("id", order.address_id);
  console.log("• set a test home pin on the address");
}

// 3. order → OUT_FOR_DELIVERY with history for the timeline
if (!(arriveOnly && order.status === "OUT_FOR_DELIVERY"))
await admin
  .from("orders")
  .update({ rider_id: rider.id, status: "OUT_FOR_DELIVERY", pickup_lat: PICKUP.lat, pickup_lng: PICKUP.lng })
  .eq("id", order.id);
const { data: hist } = await admin.from("order_status_history").select("to_status").eq("order_id", order.id);
const have = new Set((hist ?? []).map((h) => h.to_status));
let prev = order.status;
for (const s of ["ACCEPTED", "PACKED", "RIDER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY"]) {
  if (!have.has(s)) await admin.from("order_status_history").insert({ order_id: order.id, from_status: prev, to_status: s, note: "simulated" });
  prev = s;
}
console.log(`• ${displayId} is OUT_FOR_DELIVERY with the test rider`);

// 4. log in as the test phone and walk the route through the real API
const user = createClient(URL, ANON, { auth: { persistSession: false } });
const { data: session, error: vErr } = await user.auth.verifyOtp({ phone: TEST_PHONE, token: TEST_OTP, type: "sms" });
if (vErr) throw new Error(`test login failed: ${vErr.message}`);
const token = session.session.access_token;

async function arrive() {
  const res = await fetch(`${API}/rider/arrived`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ orderId: order.id }),
  });
  console.log(`🔔 arrived → ${res.status} ${JSON.stringify(await res.json().catch(() => ({})))}`);
}

if (arriveOnly) {
  await arrive();
  process.exit(0);
}

console.log(`▶ riding ${STEPS} steps, one every ${intervalSec}s (Ctrl+C to stop)`);
for (let i = 0; i <= STEPS; i++) {
  const f = i / STEPS;
  const wobble = Math.sin(f * Math.PI * 3) * 0.0012; // roads aren't straight
  const point = { lat: PICKUP.lat + (home.lat - PICKUP.lat) * f + wobble, lng: PICKUP.lng + (home.lng - PICKUP.lng) * f - wobble };
  const res = await fetch(`${API}/rider/location`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ...point, speedKmh: 22 }),
  });
  const body = await res.json().catch(() => ({}));
  console.log(`  ${String(i).padStart(2)}/${STEPS}  ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}  → ${res.status} ${JSON.stringify(body)}`);
  if (i < STEPS) await new Promise((r) => setTimeout(r, intervalSec * 1000));
}
await arrive();
console.log("✔ ride finished. Run with --reset to put the order back.");
