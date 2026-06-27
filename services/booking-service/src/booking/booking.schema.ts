import { z } from "zod";

export const createBookingSchema = z.object({
  eventId: z.uuid("eventId must be a valid UUID"),
  quantity: z
    .number()
    .int("quantity must be a whole number")
    .min(1, "minimum 1 seat")
    .max(6, "maximum 6 seats per booking")
    .default(1),
});

export const bookingIdParamSchema = z.object({
  id: z.uuid("Booking ID must be a valid UUID"),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
