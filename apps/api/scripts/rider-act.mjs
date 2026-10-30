// DEV ONLY — drive the rider API as the test rider (+917777777777).
//
//   node --env-file=.env scripts/rider-act.mjs me
//   node --env-file=.env scripts/rider-act.mjs online | offline
//   node --env-file=.env scripts/rider-act.mjs offers
//   node --env-file=.env scripts/rider-act.mjs accept  <DISPLAY_ID>
//   node --env-file=.env scripts/rider-act.mjs pickup  <DISPLAY_ID> [DISPLAY_ID…]
//   node --env-file=.env scripts/rider-act.mjs deliver <DISPLAY_ID> [cash|upi]   (reads the OTP as admin — dev only)
//   node --env-file=.env scripts/rider-act.mjs fail    <DISPLAY_ID> [reason]
//   node --env-file=.env scripts/rider-act.mjs return  <DISPLAY_ID>
//   node --env-file=.env scripts/rider-act.mjs summary | history | tasks
//   node --env-file=.env scripts/rider-act.mjs cash <amount>

import { createClient } from "@supabase/supabase-js";

const [action, ...rest] = process.argv.slice(2);
const API = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 3001}`;
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });

await anon.auth.signInWithOtp({ phone: "+917777777777" });
const { data: s, error: otpErr } = await anon.auth.verifyOtp({ phone: "+917777777777", token: "123456", type: "sms" });
if (otpErr) throw otpErr;
const token = s.session.access_token;

async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function orderId(displayId) {
  const { data } = await admin.from("orders").select("id").eq("display_id", displayId).single();
  if (!data) throw new Error(`no order ${displayId}`);
  return data.id;
}

if (action === "me") console.log(await call("GET", "/rider/me"));
else if (action === "online") console.log(await call("POST", "/rider/online", { online: true }));
else if (action === "offline") console.log(await call("POST", "/rider/online", { online: false }));
else if (action === "offers") {
  const offers = await call("GET", "/rider/offers");
  if (!offers.length) console.log("(no offers)");
  for (const o of offers) {
    console.log(`${o.display_id}  shop ${o.dealers?.shop_name}  ${o.distance_km ?? "?"} km to shop, drop ${o.drop_km ?? "?"} km  collect ₹${o.final_amount ?? o.est_amount} (${o.payment_mode})`);
  }
} else if (action === "accept") console.log(await call("POST", "/rider/offers/accept", { orderId: await orderId(rest[0]) }));
else if (action === "pickup") {
  const ids = [];
  for (const d of rest) ids.push(await orderId(d));
  console.log(await call("POST", "/rider/pickup", { orderIds: ids }));
} else if (action === "deliver") {
  const id = await orderId(rest[0]);
  const { data: otpRow } = await admin.from("order_otps").select("otp").eq("order_id", id).single();
  console.log(await call("POST", "/rider/deliver", { orderId: id, otp: otpRow.otp, payment: rest[1] === "upi" ? "upi" : "cash" }));
} else if (action === "fail") console.log(await call("POST", "/rider/fail", { orderId: await orderId(rest[0]), reason: rest[1] ?? "no_answer" }));
else if (action === "return") console.log(await call("POST", "/rider/return", { orderId: await orderId(rest[0]) }));
else if (action === "summary") console.log(await call("GET", "/rider/summary"));
else if (action === "tasks") {
  const t = await call("GET", "/rider/tasks");
  for (const o of t.orders) console.log(`${o.display_id}  ${o.status}`);
  if (t.trip) console.log("trip", t.trip.id, "stops", t.trip.trip_stops?.length);
  if (!t.orders.length) console.log("(no active orders)");
} else if (action === "history") {
  for (const t of await call("GET", "/rider/history")) {
    console.log(`trip ${t.id.slice(0, 8)}  ${t.total_km} km  stops ${t.trip_stops.map((x) => `${x.orders.display_id}${x.failed_at ? "✗" : "✓"}`).join(", ")}`);
  }
} else if (action === "cash") console.log(await call("POST", "/rider/cash-submit", { amount: Number(rest[0] ?? 0) }));
else console.error("unknown action", action);
