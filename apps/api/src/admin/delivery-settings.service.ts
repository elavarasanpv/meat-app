import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { AppChargeDefaultInput, AppChargeShopInput, DeliveryRuleInput, DeliveryTestInput } from "@thanjozmart/shared";
import { SupabaseService } from "../supabase.service";

const RULE = "id, vertical_type, pincode, min_order, fee, free_above, is_active, updated_at";

type RuleRow = { id: string; vertical_type: string; pincode: string | null; min_order: number; fee: number; free_above: number | null; is_active: boolean; updated_at: string };

function shape(r: RuleRow) {
  return {
    id: r.id,
    verticalType: r.vertical_type,
    pincode: r.pincode,
    minOrder: Number(r.min_order),
    fee: Number(r.fee),
    freeAbove: r.free_above == null ? null : Number(r.free_above),
    isActive: r.is_active,
    updatedAt: r.updated_at,
  };
}

/**
 * Delivery settings the admin controls: per vertical, a default rule
 * (minimum order, fee, free-from amount), optional rules for single pincodes,
 * and the "first order ships free" switch. Orders read these through
 * delivery_charge() in the database, so there is one place that decides a fee.
 */
@Injectable()
export class DeliverySettingsService {
  constructor(private readonly supabase: SupabaseService) {}
  private get db() {
    return this.supabase.admin;
  }

  async get() {
    const [v, r, d] = await Promise.all([
      this.db.from("verticals").select("type, label, is_active, first_order_free, app_charge_mode, app_charge_value").order("sort"),
      this.db.from("delivery_fee_rules").select(RULE).is("zone_id", null).order("pincode", { nullsFirst: true }),
      this.db.from("dealers").select("id, shop_name, store_type, app_charge_mode, app_charge_value").eq("is_active", true).order("shop_name"),
    ]);
    if (v.error) throw v.error;
    if (r.error) throw r.error;
    if (d.error) throw d.error;
    const rules = ((r.data ?? []) as RuleRow[]).map(shape);
    return (v.data ?? []).map((x) => ({
      type: x.type as string,
      label: x.label as string,
      isLive: x.is_active as boolean,
      firstOrderFree: x.first_order_free as boolean,
      defaultRule: rules.find((q) => q.verticalType === x.type && q.pincode == null) ?? null,
      pincodeRules: rules.filter((q) => q.verticalType === x.type && q.pincode != null),
      appCharge: { mode: x.app_charge_mode as "none" | "percent" | "flat", value: Number(x.app_charge_value) },
      // Every shop of this kind, with its own app charge when it has one (mode null = the default).
      shops: (d.data ?? [])
        .filter((s) => s.store_type === x.type)
        .map((s) => ({ id: s.id as string, name: s.shop_name as string, mode: s.app_charge_mode as "none" | "percent" | "flat" | null, value: s.app_charge_value == null ? null : Number(s.app_charge_value) })),
    }));
  }

  /** Create or change a rule. The default rule (no pincode) is edited, never added twice or switched off. */
  async saveRule(adminId: string, id: string | undefined, input: DeliveryRuleInput) {
    const pincode = input.pincode ?? null;
    const row = {
      vertical_type: input.verticalType,
      pincode,
      min_order: input.minOrder,
      fee: input.fee,
      free_above: input.fee === 0 ? null : input.freeAbove ?? null,
      is_active: pincode == null ? true : input.isActive ?? true,
      updated_at: new Date().toISOString(),
      updated_by: adminId,
    };
    if (id) {
      const { data: old } = await this.db.from("delivery_fee_rules").select("pincode, vertical_type").eq("id", id).is("zone_id", null).maybeSingle();
      if (!old) throw new NotFoundException("Rule not found");
      // A default stays a default and a pincode rule keeps being one.
      if ((old.pincode == null) !== (pincode == null) || old.vertical_type !== input.verticalType) throw new BadRequestException("This rule cannot be moved");
    }
    const q = id ? this.db.from("delivery_fee_rules").update(row).eq("id", id) : this.db.from("delivery_fee_rules").insert(row);
    const { data, error } = await q.select(RULE).single();
    if (error) {
      if (error.code === "23505") throw new ConflictException(pincode ? `Pincode ${pincode} already has a rule` : "The default rule already exists");
      throw error;
    }
    return shape(data as RuleRow);
  }

  /** Remove a pincode rule; that pincode goes back to the default. */
  async deleteRule(id: string) {
    const { data: old } = await this.db.from("delivery_fee_rules").select(RULE).eq("id", id).is("zone_id", null).maybeSingle();
    if (!old) throw new NotFoundException("Rule not found");
    if (old.pincode == null) throw new BadRequestException("The default rule cannot be removed");
    const { error } = await this.db.from("delivery_fee_rules").delete().eq("id", id);
    if (error) throw error;
    return shape(old as RuleRow);
  }

  async setFirstOrderFree(verticalType: string, on: boolean) {
    const { data, error } = await this.db.from("verticals").update({ first_order_free: on }).eq("type", verticalType).select("type").maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Unknown vertical");
    return { verticalType, on };
  }

  /** The app charge every shop of this kind gives per order, unless it has its own. */
  async setAppChargeDefault(input: AppChargeDefaultInput) {
    const value = input.mode === "none" ? 0 : input.value;
    const { data, error } = await this.db.from("verticals").update({ app_charge_mode: input.mode, app_charge_value: value }).eq("type", input.verticalType).select("type").maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException("Unknown vertical");
    return { verticalType: input.verticalType, mode: input.mode, value };
  }

  /** One shop's own app charge; mode null puts it back on the default. */
  async setShopAppCharge(dealerId: string, input: AppChargeShopInput) {
    const mode = input.mode;
    const value = mode == null ? null : mode === "none" ? 0 : input.value ?? null;
    if (mode && mode !== "none" && value == null) throw new BadRequestException("Enter the charge");
    const { data, error } = await this.db.from("dealers").update({ app_charge_mode: mode, app_charge_value: value }).eq("id", dealerId).select("id, shop_name").maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException("Shop not found");
    return { id: data.id as string, name: data.shop_name as string, mode, value };
  }

  /** What a basket of this amount pays at this pincode, and which rule decided it. */
  async test(input: DeliveryTestInput) {
    const { data, error } = await this.db.rpc("delivery_charge", {
      p_vertical: input.verticalType,
      p_pincode: input.pincode ?? null,
      p_items: input.amount,
      p_first: input.firstOrder ?? false,
    });
    if (error) throw error;
    const c = (Array.isArray(data) ? data[0] : data) as {
      rule_id: string | null; rule_pincode: string | null; min_order: number; fee: number; free_above: number | null;
      first_order_free: boolean; below_min: boolean; charge: number; reason: "fee" | "free_above" | "first_order" | "no_fee";
    };
    const minOrder = Number(c.min_order);
    const charge = Number(c.charge);
    return {
      rule: c.rule_id == null ? "none" : c.rule_pincode ? "pincode" : "default",
      rulePincode: c.rule_pincode,
      minOrder,
      fee: Number(c.fee),
      freeAbove: c.free_above == null ? null : Number(c.free_above),
      belowMin: c.below_min,
      shortBy: c.below_min ? minOrder - input.amount : 0,
      charge,
      reason: c.reason,
      toPay: input.amount + charge,
    };
  }
}
