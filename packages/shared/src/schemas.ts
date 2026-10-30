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
