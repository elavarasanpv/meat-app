// DEV ONLY — create/refresh the test rider (+917777777777) so the rider API
// can be exercised before the admin panel exists.
//
//   node --env-file=.env scripts/seed-rider.mjs [phone]
//
// Creates the auth user if needed (works with the Supabase test-OTP entry
// 917777777777=123456), sets the profile role to rider, and enrols an active
// delivery partner near the test shop.

import { createClient } from "@supabase/supabase-js";

const phone = (process.argv[2] ?? "917777777777").replace(/^\+/, "");
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let { data: profile } = await admin.from("profiles").select("id").eq("phone", phone).maybeSingle();
if (!profile) {
  const { data: created, error } = await admin.auth.admin.createUser({ phone: `+${phone}`, phone_confirm: true });
  if (error) throw error;
  // The handle_new_user trigger creates the profile row; wait for it.
  for (let i = 0; i < 10 && !profile; i++) {
    await new Promise((r) => setTimeout(r, 400));
    ({ data: profile } = await admin.from("profiles").select("id").eq("id", created.user.id).maybeSingle());
  }
  if (!profile) {
    const ins = await admin.from("profiles").insert({ id: created.user.id, phone, role: "rider", full_name: "Test Rider" }).select("id").single();
    if (ins.error) throw ins.error;
    profile = ins.data;
  }
  console.log("• created auth user + profile", profile.id);
}
await admin.from("profiles").update({ role: "rider", full_name: "Test Rider" }).eq("id", profile.id);

let { data: rider } = await admin.from("delivery_partners").select("id").eq("profile_id", profile.id).maybeSingle();
if (!rider) {
  const ins = await admin.from("delivery_partners").insert({ profile_id: profile.id, vehicle: "TN74 TEST 7777" }).select("id").single();
  if (ins.error) throw ins.error;
  rider = ins.data;
  console.log("• enrolled delivery partner", rider.id);
}
await admin.from("delivery_partners").update({ is_active: true }).eq("id", rider.id);

// Park the rider near the test shop so distance filters pass.
await admin.from("rider_locations").upsert({ rider_id: rider.id, lat: 8.2555, lng: 77.6655, updated_at: new Date().toISOString() });
console.log(`✔ rider ${rider.id} ready (login 7777777777 / 123456)`);
