import { z } from "zod";
import { ORDER_STATUSES } from "./order-state";
import { PAYMENT_MODES, ROLES } from "./constants";

export const roleSchema = z.enum(ROLES);
export const orderStatusSchema = z.enum(ORDER_STATUSES);
export const paymentModeSchema = z.enum(PAYMENT_MODES);

export const orderItemInputSchema = z.object({
  productId: z.string().uuid(),
  requestedKg: z.number().positive().max(25),
  cut: z.string().min(1).max(60),          // e.g. "curry cut"
  size: z.enum(["small", "medium", "large"]).optional(),
  skinless: z.boolean().optional(),
  notes: z.string().max(300).optional(),   // "remove neck, keep liver"
});

export const placeOrderSchema = z.object({
  addressId: z.string().uuid(),
  slotId: z.string().uuid(),
  paymentMode: paymentModeSchema,
  items: z.array(orderItemInputSchema).min(1).max(20),
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

export type OrderItemInput = z.infer<typeof orderItemInputSchema>;
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;
export type PackOrderInput = z.infer<typeof packOrderSchema>;
export type DeliverOrderInput = z.infer<typeof deliverOrderSchema>;
