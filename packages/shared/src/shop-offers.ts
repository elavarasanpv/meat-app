import { z } from "zod";

/**
 * Grocery shop offers. The shop (or the admin, for a shop) makes one, the
 * admin approves it, and customers near the shop see it. The shop pays for
 * every offer it makes.
 */
export const SHOP_OFFER_KINDS = ["price", "bogo", "free_gift", "next_order"] as const;
export type ShopOfferKind = (typeof SHOP_OFFER_KINDS)[number];
/** What a price or buy-get-free offer covers: one product, chosen products, or a (sub-)category. */
export const SHOP_OFFER_SCOPES = ["product", "products", "category"] as const;
export type ShopOfferScope = (typeof SHOP_OFFER_SCOPES)[number];

/**
 * Card colours an offer can wear. `ink` is the dark shade for words on white
 * (the sticker, the "Shop now" pill). An offer with no colour of its own
 * wears its kind's colour.
 */
export const SHOP_OFFER_COLORS = {
  ember: { from: "#E4461F", to: "#F2803A", ink: "#B8361A" },
  amber: { from: "#F08A24", to: "#F7B733", ink: "#A85A00" },
  green: { from: "#1F8A4C", to: "#49B46E", ink: "#156A3C" },
  violet: { from: "#5B43C9", to: "#8E6BF0", ink: "#4330A0" },
  pink: { from: "#D6336C", to: "#F0739B", ink: "#A61E4D" },
  blue: { from: "#1C6FD6", to: "#4FA3F7", ink: "#124E9C" },
  teal: { from: "#0C8599", to: "#3BC9DB", ink: "#0B6373" },
  navy: { from: "#1E2A5A", to: "#3B4C8F", ink: "#1E2A5A" },
} as const;
export type ShopOfferColor = keyof typeof SHOP_OFFER_COLORS;
export const SHOP_OFFER_COLOR_KEYS = Object.keys(SHOP_OFFER_COLORS) as [ShopOfferColor, ...ShopOfferColor[]];
const KIND_COLOR: Record<ShopOfferKind, ShopOfferColor> = { price: "ember", bogo: "amber", free_gift: "green", next_order: "violet" };
/** The colour key an offer wears: its own, else its kind's. */
export const shopOfferColorKey = (kind: ShopOfferKind, color?: string | null): ShopOfferColor =>
  color && color in SHOP_OFFER_COLORS ? (color as ShopOfferColor) : KIND_COLOR[kind];
export const shopOfferColors = (kind: ShopOfferKind, color?: string | null) => SHOP_OFFER_COLORS[shopOfferColorKey(kind, color)];

const id = z.string().uuid();
const rupees = z.coerce.number().positive().max(100000);

export const shopOfferSchema = z
  .object({
    kind: z.enum(SHOP_OFFER_KINDS),
    masterProductId: id.nullable().optional(),
    scope: z.enum(SHOP_OFFER_SCOPES).optional(),
    productIds: z.array(id).max(200).nullable().optional(),
    categoryId: id.nullable().optional(),
    pct: z.coerce.number().positive().max(100).nullable().optional(),
    buyQty: z.coerce.number().int().min(1).max(10).nullable().optional(),
    freeQty: z.coerce.number().int().min(1).max(10).nullable().optional(),
    /** Buy-and-get-free on many products: count any mix of them together, not each product on its own. */
    mix: z.boolean().optional(),
    /** The card colour; empty means the kind's own colour. */
    color: z.enum(SHOP_OFFER_COLOR_KEYS).nullable().optional(),
    minOrder: rupees.nullable().optional(),
    maxDiscount: rupees.nullable().optional(),
    validDays: z.coerce.number().int().min(1).max(60).nullable().optional(),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    isActive: z.boolean().optional(),
    /** Admin only: the shop the offer is for. */
    dealerId: id.optional(),
    /** Admin only: who pays for the offer. A shop's own offer is always the shop's. */
    paidBy: z.enum(["shop", "app"]).optional(),
  })
  .superRefine((o, ctx) => {
    const need = (ok: unknown, path: string, message: string) => {
      if (!ok) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    };
    if (new Date(o.endsAt).getTime() <= new Date(o.startsAt).getTime()) need(false, "endsAt", "The offer must end after it starts");
    const covers = () => {
      if (o.scope === "products") need(o.productIds?.length, "productIds", "Choose the products");
      else if (o.scope === "category") need(o.categoryId, "categoryId", "Choose a category");
      else need(o.masterProductId, "masterProductId", "Choose a product");
    };
    if (o.kind === "price") {
      covers();
      need(o.pct && o.pct < 100, "pct", "Discount must be between 1 and 99%");
    }
    if (o.kind === "bogo") {
      covers();
      need(o.buyQty, "buyQty", "How many must they buy?");
      need(o.freeQty, "freeQty", "How many do they get free?");
    }
    if (o.kind === "free_gift") {
      need(o.masterProductId, "masterProductId", "Choose the free item");
      need(o.minOrder, "minOrder", "Order amount needed for the gift");
      need(o.freeQty && o.freeQty <= 5, "freeQty", "Gift quantity 1 to 5");
    }
    if (o.kind === "next_order") {
      need(o.pct, "pct", "Discount on the next order");
      need(o.minOrder, "minOrder", "Order amount needed today");
      need(o.maxDiscount, "maxDiscount", "Most it can save");
      need(o.validDays, "validDays", "How many days the coupon lasts");
    }
  });
export type ShopOfferInput = z.infer<typeof shopOfferSchema>;

export const shopOfferReviewSchema = z.object({
  approve: z.boolean(),
  reason: z.string().trim().max(200).optional(),
});

/** The fields every offer text needs. */
export type ShopOfferFacts = {
  kind: ShopOfferKind;
  pct?: number | null;
  buyQty?: number | null;
  freeQty?: number | null;
  /** Buy-and-get-free that counts any mix of its products. */
  mix?: boolean | null;
  minOrder?: number | null;
  maxDiscount?: number | null;
  product?: string | null;
  productTa?: string | null;
};

const n = (v: number | null | undefined) => Number(v ?? 0);

/** Short headline for a badge or card, English and Tamil. */
export function shopOfferHeadline(o: ShopOfferFacts): { en: string; ta: string } {
  switch (o.kind) {
    case "price":
      return { en: `${n(o.pct)}% OFF`, ta: `${n(o.pct)}% தள்ளுபடி` };
    case "bogo":
      return o.mix
        ? { en: `BUY ANY ${n(o.buyQty)} GET ${n(o.freeQty)} FREE`, ta: `எவையேனும் ${n(o.buyQty)} வாங்கினால் ${n(o.freeQty)} இலவசம்` }
        : { en: `BUY ${n(o.buyQty)} GET ${n(o.freeQty)} FREE`, ta: `${n(o.buyQty)} வாங்கினால் ${n(o.freeQty)} இலவசம்` };
    case "free_gift":
      return { en: `FREE GIFT above ₹${n(o.minOrder)}`, ta: `₹${n(o.minOrder)}க்கு மேல் இலவச பரிசு` };
    case "next_order":
      return { en: `${n(o.pct)}% OFF your next order`, ta: `அடுத்த ஆர்டரில் ${n(o.pct)}% தள்ளுபடி` };
  }
}

/** The promotional push for a newly live offer. */
export function shopOfferPush(o: ShopOfferFacts): { title: string; body: string; ta: { title: string; body: string } } {
  const p = o.product ?? "";
  const pTa = o.productTa || p;
  switch (o.kind) {
    case "price":
      return {
        title: `🔥 ${n(o.pct)}% OFF!`,
        body: `Get ${p} today at a special price on Thanjoz Mart.`,
        ta: { title: `🔥 ${n(o.pct)}% தள்ளுபடி!`, body: `இன்று ${pTa} சிறப்பு விலையில் Thanjoz Mart-ல் பெறுங்கள்.` },
      };
    case "bogo":
      return {
        title: `🎉 Buy ${o.mix ? "any " : ""}${n(o.buyQty)} Get ${n(o.freeQty)} FREE!`,
        body: `${p}: buy ${o.mix ? "any " : ""}${n(o.buyQty)}, get ${n(o.freeQty)} free. Only on Thanjoz Mart.`,
        ta: { title: `🎉 ${o.mix ? "எவையேனும் " : ""}${n(o.buyQty)} வாங்கினால் ${n(o.freeQty)} இலவசம்!`, body: `${pTa}: Thanjoz Mart-ல் மட்டும்.` },
      };
    case "free_gift":
      return {
        title: `🎁 Free ${p}!`,
        body: `Order above ₹${n(o.minOrder)} on Thanjoz Mart and get ${p} free.`,
        ta: { title: `🎁 இலவச ${pTa}!`, body: `Thanjoz Mart-ல் ₹${n(o.minOrder)}க்கு மேல் ஆர்டர் செய்து ${pTa} இலவசமாகப் பெறுங்கள்.` },
      };
    case "next_order":
      return {
        title: `💸 ${n(o.pct)}% off your next order`,
        body: `Order above ₹${n(o.minOrder)} today on Thanjoz Mart and save up to ₹${n(o.maxDiscount)} next time.`,
        ta: { title: `💸 அடுத்த ஆர்டரில் ${n(o.pct)}% தள்ளுபடி`, body: `இன்று ₹${n(o.minOrder)}க்கு மேல் ஆர்டர் செய்தால் அடுத்த முறை ₹${n(o.maxDiscount)} வரை சேமிக்கலாம்.` },
      };
  }
}

/** Free units a "buy N get M" line earns: every full N bought brings M free. */
export function bogoFreeUnits(qty: number, buy: number, free: number): number {
  if (buy <= 0 || free <= 0) return 0;
  return Math.floor(qty / buy + 1e-9) * free;
}

/** The next-order coupon's saving on a subtotal. */
export function couponSaving(subtotal: number, pct: number, max: number): number {
  return Math.max(0, Math.min(Math.round((subtotal * pct) / 100), Math.round(max), Math.round(subtotal)));
}
