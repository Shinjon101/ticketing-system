import { z } from "zod";

export const createEventSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(2000).optional(),
  venue: z.string().min(1, "Venue is required").max(300),

  // coerce lets clients send a date string — Zod converts it to a Date object
  eventDate: z.coerce
    .date()
    .refine((d) => d > new Date(), "Event date must be in the future"),

  totalSeats: z
    .number()
    .int("Seats must be a whole number")
    .min(1, "Must have at least 1 seat")
    .max(100_000, "Maximum 100,000 seats"),

  // Price in paise — clients send ₹500 as 50000
  price: z
    .number()
    .int("Price must be in paise (whole number)")
    .min(0, "Price cannot be negative"),

  saleStartsAt: z.coerce.date().optional(),
});

export const updateEventSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    venue: z.string().min(1).max(300).optional(),
    eventDate: z.coerce.date().optional(),
    totalSeats: z.number().int().min(1).optional(),
    price: z.number().int().min(0).optional(),
    saleStartsAt: z.coerce.date().optional(),
    status: z.enum(["draft", "active", "cancelled"]).optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    "At least one field must be provided for update",
  );

export const eventIdParamSchema = z.object({
  id: z.uuid("Event ID must be a valid UUID"),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
