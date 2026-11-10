import { z } from "zod";
import { CANCEL_REASONS, ORDER_STATUSES } from "./order-state";
import { PAYMENT_MODES, ROLES } from "./constants";

export const roleSchema = z.enum(ROLES);
export const orderStatusSchema = z.enum(ORDER_STATUSES);
export const paymentModeSchema = z.enum(PAYMENT_MODES);

export const orderItemInputSchema = z.object({
  productId: z.string().uuid(),
  /** Kg (0.5 steps) for weight products, piece count for eggs. */
  qty: z.number().positive().max(50),
  size: z.enum(["small", "medium", "large"]).optional(),
  notes: z.string().max(300).optional(),   // "remove neck, keep liver"
});

export const deliverySlotSchema = z.object({
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
});

export const placeOrderSchema = z.object({
  addressId: z.string().uuid(),
  slot: deliverySlotSchema,
  /** Prepaid UPI comes with the payment gateway later. */
  paymentMode: z.enum(["cod", "upi_on_delivery"]),
  items: z.array(orderItemInputSchema).min(1).max(20),
  /** Coupon the customer typed in the cart; the server picks the best offer either way. */
  couponCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3,20}$/).optional(),
});

/** Items the customer adds to an order they already placed (allowed until the shop accepts). */
export const addOrderItemsSchema = z.object({
  items: z.array(orderItemInputSchema).min(1).max(10),
});

export const addressInputSchema = z.object({
  label: z.string().min(1).max(30),
  addressText: z.string().min(5).max(300),
  landmark: z.string().max(120).optional(),
  pincode: z.string().regex(/^[1-9]\d{5}$/),
});

export const packOrderSchema = z.object({
  orderId: z.string().uuid(),
  labelCode: z.string().regex(/^LBL-\d{6}$/),
  actualWeights: z.array(
    z.object({ orderItemId: z.string().uuid(), actualKg: z.number().positive() })
  ),
  packedPhotoPath: z.string().min(1),
});

export const deliverOrderSchema = z.object({
  orderId: z.string().uuid(),
  otp: z.string().length(4).regex(/^\d{4}$/),
  handoverPhotoPath: z.string().min(1),
  paymentMethod: z.enum(["cash", "upi_qr"]).optional(), // required for COD orders
  lat: z.number().optional(),
  lng: z.number().optional(),
});

export const riderLocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  heading: z.number().min(0).max(360).optional(),
  speedKmh: z.number().min(0).max(200).optional(),
});

/** Reasons a rider may mark a stop as failed (after calling and waiting). */
export const DELIVERY_FAIL_REASONS = ["no_answer", "refused", "wrong_address", "other"] as const;

/** Pick up one or more RIDER_ASSIGNED orders at the same shop; starts a trip. */
export const riderPickupSchema = z.object({
  orderIds: z.array(z.string().uuid()).min(1).max(3),
});

/** Hand over one stop: the customer's OTP plus how they paid. */
export const riderDeliverSchema = z.object({
  orderId: z.string().uuid(),
  otp: z.string().regex(/^\d{4}$/, "4-digit OTP"),
  payment: z.enum(["cash", "upi"]),
});

export const riderFailSchema = z.object({
  orderId: z.string().uuid(),
  reason: z.enum(DELIVERY_FAIL_REASONS),
  photoPath: z.string().max(500).optional(),
});

/** Day-end cash hand-over to the admin. */
export const riderCashSubmitSchema = z.object({
  amount: z.number().min(0).max(100000),
});

/** A batch of GPS fixes from the rider app (sent live, or buffered while offline). */
export const riderLocationBatchSchema = z.object({
  points: z
    .array(
      z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        heading: z.number().min(0).max(360).optional(),
        speedKmh: z.number().min(0).max(200).optional(),
        /** When the phone took the fix (ISO). */
        at: z.string().datetime(),
      }),
    )
    .min(1)
    .max(300),
});

export const DEALER_REJECT_REASONS = ["out_of_stock", "closing", "too_busy", "other"] as const;

export const dealerAcceptSchema = z.object({
  orderId: z.string().uuid(),
  /** Minutes until the order will be packed and ready for pickup. */
  readyMinutes: z.number().int().min(5).max(120),
});

export const dealerRejectSchema = z.object({
  orderId: z.string().uuid(),
  reason: z.enum(DEALER_REJECT_REASONS),
  note: z.string().max(200).optional(),
});

export const itemUnavailableSchema = z.object({
  orderId: z.string().uuid(),
  orderItemId: z.string().uuid(),
});

export const weighItemSchema = z.object({
  orderId: z.string().uuid(),
  orderItemId: z.string().uuid(),
  /** Actual packed weight in kg (or piece count for per-piece items). */
  actualQty: z.number().positive().max(100),
  /** Storage path of the scale photo in the order-proofs bucket. */
  photoPath: z.string().min(1).max(500).optional(),
});

/** Photo of one packed item on the weighing scale (already uploaded to the order-proofs bucket). */
export const itemPhotoSchema = z.object({
  orderId: z.string().uuid(),
  orderItemId: z.string().uuid(),
  /** Storage path: <orderId>/<orderItemId>-<time>.jpg */
  photoPath: z.string().min(1).max(500),
});

export const shopStateSchema = z.object({
  isOpen: z.boolean().optional(),
  /** ISO time the shop stays closed until; null clears it. */
  closedUntil: z.string().datetime({ offset: true }).nullable().optional(),
});

export const stockSchema = z.object({
  productId: z.string().uuid(),
  /** null = in stock; an ISO time = out until then; "infinity" = until switched on. */
  outOfStockUntil: z.union([z.string().datetime({ offset: true }), z.literal("infinity"), z.null()]),
});

export const cancelOrderSchema = z.object({
  reason: z.enum(CANCEL_REASONS),
  note: z.string().max(200).optional(),
});

export type OrderItemInput = z.infer<typeof orderItemInputSchema>;
export type DeliverySlotInput = z.infer<typeof deliverySlotSchema>;
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;
export type AddOrderItemsInput = z.infer<typeof addOrderItemsSchema>;
export type AddressInput = z.infer<typeof addressInputSchema>;
export type RiderLocationInput = z.infer<typeof riderLocationSchema>;
export type RiderPickupInput = z.infer<typeof riderPickupSchema>;
export type RiderLocationBatchInput = z.infer<typeof riderLocationBatchSchema>;
export type RiderDeliverInput = z.infer<typeof riderDeliverSchema>;
export type RiderFailInput = z.infer<typeof riderFailSchema>;
export type RiderCashSubmitInput = z.infer<typeof riderCashSubmitSchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
export type PackOrderInput = z.infer<typeof packOrderSchema>;
export type DealerAcceptInput = z.infer<typeof dealerAcceptSchema>;
export type DealerRejectInput = z.infer<typeof dealerRejectSchema>;
export type ItemUnavailableInput = z.infer<typeof itemUnavailableSchema>;
export type WeighItemInput = z.infer<typeof weighItemSchema>;
export type ItemPhotoInput = z.infer<typeof itemPhotoSchema>;
export type ShopStateInput = z.infer<typeof shopStateSchema>;
export type StockInput = z.infer<typeof stockSchema>;
export type DeliverOrderInput = z.infer<typeof deliverOrderSchema>;

// ───────────────────────── admin ─────────────────────────
/** Indian mobile number, 10 digits (a leading +91/91/0 is stripped). */
export const indianMobileSchema = z
  .string()
  .transform((s) => s.replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, ""))
  .pipe(z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number"));

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

export const adminShopSchema = z.object({
  phone: indianMobileSchema,
  ownerName: z.string().trim().min(2).max(80),
  shopName: z.string().trim().min(2).max(80),
  fssaiNo: z.string().trim().max(20).optional().nullable(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  pincodes: z.array(z.string().regex(/^[1-9]\d{5}$/)).min(1, "Pick at least one pincode"),
  openWindows: z.array(z.tuple([hhmm, hhmm])).min(1).max(4),
  weeklyOff: z.number().int().min(0).max(6).nullable(),
  products: z.array(z.object({ productId: z.string().uuid(), pricePerKg: z.number().positive().max(100000) })),
  isActive: z.boolean().optional(),
});
export type AdminShopInput = z.infer<typeof adminShopSchema>;

export const adminRiderSchema = z.object({
  phone: indianMobileSchema,
  name: z.string().trim().min(2).max(80),
  vehicle: z.string().trim().max(20).optional().nullable(),
  isActive: z.boolean().optional(),
});
export type AdminRiderInput = z.infer<typeof adminRiderSchema>;

export const adminCancelSchema = z.object({ reason: z.string().trim().min(3).max(200) });
export const adminReassignShopSchema = z.object({ dealerId: z.string().uuid().optional() });
export const adminCashVerifySchema = z.object({
  received: z.number().min(0).max(1_000_000),
  note: z.string().trim().max(200).optional(),
});

export const adminProfileSchema = z.object({ name: z.string().trim().min(2).max(80) });
export const adminInviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  note: z.string().trim().max(80).optional(),
  appUrl: z.string().url(),
});

// ───────────────────────── support ─────────────────────────
export const TICKET_TYPES = ["missing_item", "quality", "late", "rider_behaviour", "charged_wrong", "other"] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export const createTicketSchema = z.object({
  orderId: z.string().uuid().optional(),
  orderItemId: z.string().uuid().optional(),
  type: z.enum([...TICKET_TYPES, "delivery_failed", "app_issue", "cash_dispute"]),
  body: z.string().trim().min(5, "Tell us a little more").max(1000),
  photoBase64: z.string().max(1_500_000).optional(), // ~1 MB JPEG
});
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const ticketReplySchema = z.object({
  body: z.string().trim().min(1).max(1000),
  photoBase64: z.string().max(1_500_000).optional(),
});

export const ticketResolveSchema = z.object({
  resolution: z.enum(["credit", "refund_upi", "apology", "none"]),
  fault: z.enum(["shop", "rider", "freshcut", "customer", "none"]),
  amount: z.number().positive().max(100_000).optional(),
  note: z.string().trim().max(500).optional(),
});
export type TicketResolveInput = z.infer<typeof ticketResolveSchema>;

/** Auto-credit: missing-item claims up to this much, with a photo, settle instantly. */
export const AUTO_CREDIT_MAX = 100;
/** …but only once per customer per this many days. */
export const AUTO_CREDIT_COOLDOWN_DAYS = 7;

// ───────────────────────── ratings ─────────────────────────
const stars = z.number().int().min(1).max(5);
const note = z.string().trim().max(300).optional().nullable();
/** Quick chips a customer can tap about the delivery; the apps translate them. */
export const RIDER_TAGS = ["fast", "polite", "packaging", "careful", "late", "rude", "packaging_bad", "not_hygienic"] as const;
export const rateOrderSchema = z.object({
  rider: z.object({ stars, note, tags: z.array(z.enum(RIDER_TAGS)).max(8).optional() }).optional().nullable(),
  app: z.object({ stars, note }).optional().nullable(),
  items: z.array(z.object({ orderItemId: z.string().uuid(), stars, note })).max(30),
});
export type RateOrderInput = z.infer<typeof rateOrderSchema>;

// ───────────────────────── offers ─────────────────────────
export const adminOfferSchema = z.object({
  kind: z.enum(["banner", "coupon"]),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3,20}$/, "3–20 letters or digits").optional().nullable(),
  title: z.string().trim().min(3).max(80),
  titleTa: z.string().trim().max(120).optional().nullable(),
  subtitle: z.string().trim().max(120).optional().nullable(),
  imageBase64: z.string().max(1_500_000).optional().nullable(), // new upload
  removeImage: z.boolean().optional(), // drop the current photo
  tint: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
  discountType: z.enum(["percent", "flat"]),
  discountValue: z.number().positive().max(100_000),
  maxDiscount: z.number().positive().max(100_000).optional().nullable(),
  minOrder: z.number().positive().max(1_000_000).optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  subcategoryId: z.string().uuid().optional().nullable(),
  productIds: z.array(z.string().uuid()).max(50).optional().nullable(),
  pincodes: z.array(z.string().regex(/^[1-9]\d{5}$/)).optional().nullable(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  isActive: z.boolean().optional(),
  sort: z.number().int().min(0).max(999).optional(),
  shopSharePct: z.number().min(0).max(100),
  firstOrderOnly: z.boolean().optional(),
  perCustomerLimit: z.number().int().positive().max(1000).optional().nullable(),
  totalLimit: z.number().int().positive().max(1_000_000).optional().nullable(),
}).superRefine((v, ctx) => {
  if (v.kind === "coupon" && !v.code) ctx.addIssue({ code: "custom", path: ["code"], message: "A coupon needs a code" });
  if (v.discountType === "percent" && v.discountValue > 90) ctx.addIssue({ code: "custom", path: ["discountValue"], message: "Percent discounts are capped at 90%" });
  if (new Date(v.endsAt) <= new Date(v.startsAt)) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "Must end after it starts" });
});
export type AdminOfferInput = z.infer<typeof adminOfferSchema>;

export const offerQuoteSchema = z.object({
  items: z.array(z.object({ productId: z.string().uuid(), qty: z.number().positive().max(100), price: z.number().positive().max(100_000) })).min(1).max(20),
  couponCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3,20}$/).optional(),
  pincode: z.string().regex(/^[1-9]\d{5}$/).optional(),
});
export type OfferQuoteInput = z.infer<typeof offerQuoteSchema>;

export const adminHeadlineSchema = z
  .object({
    title: z.string().trim().min(3).max(60),
    titleTa: z.string().trim().max(80).optional().nullable(),
    subtitle: z.string().trim().max(80).optional().nullable(),
    subtitleTa: z.string().trim().max(100).optional().nullable(),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    isActive: z.boolean().optional(),
  })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), { path: ["endsAt"], message: "Must end after it starts" });
export type AdminHeadlineInput = z.infer<typeof adminHeadlineSchema>;
