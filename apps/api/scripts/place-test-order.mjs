// DEV ONLY — place a fresh order as the test customer (+919999999999) so the
// dealer app gets a new offer to accept.
//   node --env-file=.env scripts/place-test-order.mjs
import { createClient } from "@supabase/supabase-js";

const API = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 3001}`;
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });

await anon.auth.signInWithOtp({ phone: "+919999999999" });
const { data: s } = await anon.auth.verifyOtp({ phone: "+919999999999", token: "123456", type: "sms" });
const token = s.session.access_token;
const call = async (method, path, body) => {
  const res = await fetch(`${API}${path}`, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return JSON.parse(text);
};

const { data: addr } = await admin.from("addresses").select("id").eq("user_id", s.user.id).is("archived_at", null).limit(1).single();
const { data: products } = await admin.from("products").select("id, name").in("name", ["Curry cut", "Goat mutton curry cut"]);
const slots = await call("GET", "/orders/slots");
const placed = await call("POST", "/orders", {
  addressId: addr.id,
  slot: { startsAt: slots[0].startsAt, endsAt: slots[0].endsAt },
  paymentMode: "cod",
  items: products.map((p) => ({ productId: p.id, qty: 1, size: "medium", notes: p.name.startsWith("Curry") ? "Remove skin please" : undefined })),
});
console.log("placed", placed.displayId, "₹" + placed.estAmount);
