// Add an email to the admin allowlist and print their personal invite link.
//
//   node --env-file=.env scripts/invite-admin.mjs you@example.com "Elavarasan — owner"
//
// Open the printed link in a browser: it lands on the admin app's
// set-password page, where the person picks their own password. Re-running
// for an existing account prints a fresh reset link instead.

import { createClient } from "@supabase/supabase-js";

const [email0, ...noteParts] = process.argv.slice(2);
if (!email0) {
  console.error("usage: node --env-file=.env scripts/invite-admin.mjs <email> [note]");
  process.exit(1);
}
const email = email0.toLowerCase();
const note = noteParts.join(" ") || null;
const ADMIN_URL = (process.env.ADMIN_URL ?? "http://localhost:5173").replace(/\/$/, "");

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { error: listErr } = await admin.from("admin_emails").upsert({ email, note });
if (listErr) throw listErr;
console.log(`✔ ${email} is on the admin allowlist${note ? ` (${note})` : ""}`);

let link = await admin.auth.admin.generateLink({ type: "invite", email });
let kind = "invite";
if (link.error) {
  // Account already exists: a recovery link lets them (re)set the password.
  link = await admin.auth.admin.generateLink({ type: "recovery", email });
  kind = "recovery";
  // An existing account predates the allowlist row: make sure it has the admin role.
  const { data: user } = link;
  if (user?.user?.id) await admin.from("profiles").update({ role: "admin" }).eq("id", user.user.id);
}
if (link.error) throw link.error;

const tokenHash = link.data.properties.hashed_token;
console.log(`\nSend them this link (${kind}, valid ~24 h):\n`);
console.log(`${ADMIN_URL}/set-password#token_hash=${tokenHash}&type=${kind}\n`);
