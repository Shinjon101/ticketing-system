import { z } from "zod";

export const createOrderSchema = z.object({
  bookingId: z.uuid("bookingId must be a valid UUID"),
});

export const verifyPaymentSchema = z.object({
  bookingId: z.uuid(),
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});
