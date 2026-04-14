import { z } from "zod";

export const EventCreatedSchema = z.object({
  messageId: z.uuid(),
  eventId: z.uuid(),
  title: z.string(),
  totalSeats: z.number().int().positive(),
  price: z.number().positive().positive(), //paise
  eventDate: z.iso.datetime(),
  status: z.enum(["active", "draft"]),
});

export const EventUpdatedSchema = z.object({
  messageId: z.uuid(),
  eventId: z.uuid(),
  changes: z.object({
    title: z.string().optional(),
    price: z.number().int().positive().optional(),
    totalSeats: z.number().int().positive().optional(),
    status: z.enum(["active", "draft", "cancelled"]).optional(),
  }),
});

export const SeatReserveRequestedSchema = z.object({
  messageId: z.uuid(),
  bookingId: z.uuid(),
  userId: z.uuid(),
  eventId: z.uuid(),
  requestedAt: z.iso.datetime(),
});

export const SeatReservedSchema = z.object({
  messageId: z.uuid(),
  bookingId: z.uuid(),
  seatId: z.uuid(),
  seatNumber: z.string(),
  reservedAt: z.iso.datetime(),
});

export const SeatFailedSchema = z.object({
  messageId: z.uuid(),
  bookingId: z.uuid(),
  reason: z.enum(["no_seats_available", "event_not_found"]),
});

export type EventCreated = z.infer<typeof EventCreatedSchema>;
export type EventUpdated = z.infer<typeof EventUpdatedSchema>;
export type SeatReserveRequested = z.infer<typeof SeatReserveRequestedSchema>;
export type SeatReserved = z.infer<typeof SeatReservedSchema>;
export type SeatFailed = z.infer<typeof SeatFailedSchema>;
