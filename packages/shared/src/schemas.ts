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

export const cancelOrderSchema = z.object({
  reason: z.enum(CANCEL_REASONS),
  note: z.string().max(200).optional(),
});

export type OrderItemInput = z.infer<typeof orderItemInputSchema>;
export type DeliverySlotInput = z.infer<typeof deliverySlotSchema>;
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;
export type AddressInput = z.infer<typeof addressInputSchema>;
export type RiderLocationInput = z.infer<typeof riderLocationSchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
export type PackOrderInput = z.infer<typeof packOrderSchema>;
export type DeliverOrderInput = z.infer<typeof deliverOrderSchema>;
