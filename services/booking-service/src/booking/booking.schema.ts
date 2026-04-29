import { z } from "zod";

export const createBookingSchema = z.object({
  eventId: z.uuid("eventId must be a valid UUID"),
});

export const bookingIdParamSchema = z.object({
  id: z.uuid("Booking ID must be a valid UUID"),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
