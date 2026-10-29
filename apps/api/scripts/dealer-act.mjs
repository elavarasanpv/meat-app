// DEV ONLY — perform one dealer action against the local API, as the test
// dealer. Lets you play "shop owner" while watching the customer app.
//
//   node --env-file=.env scripts/dealer-act.mjs inbox
//   node --env-file=.env scripts/dealer-act.mjs accept  MT-1029-0005 [readyMinutes]
//   node --env-file=.env scripts/dealer-act.mjs reject  MT-1029-0005 [reason]
//   node --env-file=.env scripts/dealer-act.mjs cutting MT-1029-0005
//   node --env-file=.env scripts/dealer-act.mjs weigh   MT-1029-0005   (all items, +4%)
//   node --env-file=.env scripts/dealer-act.mjs packed  MT-1029-0005

import { createClient } from "@supabase/supabase-js";

const [action, displayId, extra] = process.argv.slice(2);
const API = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 3001}`;
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });

await anon.auth.signInWithOtp({ phone: "+918888888888" });
const { data: s } = await anon.auth.verifyOtp({ phone: "+918888888888", token: "123456", type: "sms" });
const token = s.session.access_token;
const call = async (method, path, body) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return JSON.parse(text);
};

const orderIdOf = async () => {
  const { data } = await admin.from("orders").select("id").eq("display_id", displayId).single();
  if (!data) throw new Error(`no order ${displayId}`);
  return data.id;
};

if (action === "inbox") {
  const inbox = await call("GET", "/dealer/orders");
  for (const o of inbox) {
    console.log(`${o.display_id}  ${o.status}  est ₹${o.est_amount}  items: ${o.order_items.map((i) => i.products.name).join(", ")}`);
  }
  if (!inbox.length) console.log("(inbox empty)");
} else if (action === "accept") {
  const r = await call("POST", "/dealer/orders/accept", { orderId: await orderIdOf(), readyMinutes: Number(extra) || 30 });
  console.log("accepted — ready by", r.readyBy);
} else if (action === "reject") {
  const r = await call("POST", "/dealer/orders/reject", { orderId: await orderIdOf(), reason: extra || "too_busy" });
  console.log("rejected — passed to next shop:", r.passedOn);
} else if (action === "cutting") {
  await call("POST", `/dealer/orders/${await orderIdOf()}/start-cutting`);
  console.log("cutting started");
} else if (action === "weigh") {
  const orderId = await orderIdOf();
  const inbox = await call("GET", "/dealer/orders");
  const order = inbox.find((o) => o.id === orderId);
  for (const it of order.order_items.filter((i) => !i.unavailable)) {
    const qty = Math.round(Number(it.requested_kg) * 1.04 * 100) / 100;
    await call("POST", "/dealer/orders/weigh", { orderId, orderItemId: it.id, actualQty: qty });
    console.log(`weighed ${it.products.name}: ${qty}`);
  }
} else if (action === "packed") {
  const r = await call("POST", `/dealer/orders/${await orderIdOf()}/packed`);
  console.log("packed — final ₹" + r.finalAmount);
} else {
  console.log("usage: dealer-act.mjs inbox | accept <id> [min] | reject <id> [reason] | cutting <id> | weigh <id> | packed <id>");
}
