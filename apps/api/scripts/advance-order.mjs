// DEV ONLY — step an order's status forward (or set it) to test the customer
// app's live progress UI without the dealer/rider apps.
//
//   node --env-file=.env scripts/advance-order.mjs MT-1029-0002 ACCEPTED
//   node --env-file=.env scripts/advance-order.mjs MT-1029-0002 PLACED   (reset)
//
// Writes straight to the DB with the service role (bypasses the API's
// state machine) and records the step in order_status_history so the
// timeline shows a time.

import { createClient } from "@supabase/supabase-js";

const [displayId, status] = process.argv.slice(2);
if (!displayId || !status) {
  console.error("usage: node --env-file=.env scripts/advance-order.mjs <DISPLAY_ID> <STATUS>");
  process.exit(1);
}
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: order, error } = await admin.from("orders").select("id,status").eq("display_id", displayId).single();
if (error || !order) throw error ?? new Error("order not found");

const { error: e1 } = await admin.from("orders").update({ status }).eq("id", order.id);
if (e1) throw e1;
if (status === "PLACED") {
  await admin.from("order_status_history").delete().eq("order_id", order.id).neq("to_status", "PLACED");
} else {
  await admin.from("order_status_history").insert({ order_id: order.id, from_status: order.status, to_status: status });
}
console.log(`${displayId}: ${order.status} → ${status}`);
