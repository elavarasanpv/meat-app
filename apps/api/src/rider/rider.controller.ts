import { BadRequestException, Body, Controller, ForbiddenException, Headers, Post } from "@nestjs/common";
import { riderLocationSchema } from "@freshcut/shared";
import { SupabaseService } from "../supabase.service";
import { requireUser } from "../auth";

/** Statuses during which a rider's position is useful (and shared with the customer). */
const ACTIVE = ["RIDER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY"];

@Controller("rider")
export class RiderController {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * POST /rider/location — the partner app sends this every ~45 s (or ~100 m)
   * while the rider has an active order. Stores only the latest position.
   */
  @Post("location")
  async location(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const user = await requireUser(this.supabase, auth);
    const parsed = riderLocationSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((i) => i.message).join("; "));
    const { lat, lng, heading, speedKmh } = parsed.data;
    const db = this.supabase.admin;

    const { data: rider } = await db.from("delivery_partners").select("id").eq("profile_id", user.id).eq("is_active", true).maybeSingle();
    if (!rider) throw new ForbiddenException("Not a rider");

    const { count } = await db.from("orders").select("id", { count: "exact", head: true }).eq("rider_id", rider.id).in("status", ACTIVE);
    if (!count) return { stored: false, reason: "no active order" };

    const { error } = await db.from("rider_locations").upsert({
      rider_id: rider.id,
      lat,
      lng,
      heading: heading ?? null,
      speed_kmh: speedKmh ?? null,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new BadRequestException(error.message);
    return { stored: true };
  }
}
