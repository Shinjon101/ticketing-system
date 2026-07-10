import { z } from "zod";

export const EventCreatedSchema = z.object({
  messageId: z.uuid(),
  eventId: z.uuid(),
  title: z.string(),
  totalSeats: z.number().int().positive(),
  price: z.number().positive().positive(), //paise
  eventDate: z.iso.datetime(),
  status: z.enum(["active", "draft"]),
  saleStartsAt: z.coerce.date().optional(),
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
  quantity: z.number().int().positive(),
  requestedAt: z.iso.datetime(),
});

export const SeatReservedSchema = z.object({
  messageId: z.uuid(),
  bookingId: z.uuid(),
  seatIds: z.array(z.string()),
  seatNumbers: z.array(z.string()),
  reservedAt: z.iso.datetime(),
});

export const SeatFailedSchema = z.object({
  messageId: z.uuid(),
  bookingId: z.uuid(),
  reason: z.enum([
    "no_seats_available",
    "event_not_found",
    "insufficient_seats",
  ]),
});

export const SeatReleaseSchema = z.object({
  messageId: z.uuid(),
  bookingId: z.uuid(),
  eventId: z.uuid(),
  seatIds: z.array(z.string()),
});

export const BookingSeatHeldSchema = z.object({
  messageId: z.uuid(),
  bookingId: z.uuid(),
  userId: z.uuid(),
  eventId: z.uuid(),
  seatIds: z.array(z.string()),
  seatNumbers: z.array(z.string()),
  amount: z.number().int().positive(), // total in paise
  expiresAt: z.iso.datetime(),
});

export const PaymentCompletedSchema = z.object({
  messageId: z.uuid(),
  bookingId: z.uuid(),
  razorpayPaymentId: z.string(),
  razorpayOrderId: z.string(),
  amount: z.number().int().positive(),
  paidAt: z.iso.datetime(),
});

export const PaymentFailedSchema = z.object({
  messageId: z.uuid(),
  bookingId: z.uuid(),
  reason: z.enum([
    "payment_declined",
    "payment_cancelled",
    "hold_expired",
    "signature_mismatch",
  ]),
  failedAt: z.iso.datetime(),
});

export type EventCreated = z.infer<typeof EventCreatedSchema>;
export type EventUpdated = z.infer<typeof EventUpdatedSchema>;
export type SeatReserveRequested = z.infer<typeof SeatReserveRequestedSchema>;
export type SeatReserved = z.infer<typeof SeatReservedSchema>;
export type SeatFailed = z.infer<typeof SeatFailedSchema>;
export type SeatRelease = z.infer<typeof SeatReleaseSchema>;
export type BookingSeatHeld = z.infer<typeof BookingSeatHeldSchema>;
export type PaymentCompleted = z.infer<typeof PaymentCompletedSchema>;
export type PaymentFailed = z.infer<typeof PaymentFailedSchema>;

import { TOPICS } from "./topics";

export const TOPIC_SCHEMAS = {
  [TOPICS.EVENT_CREATED]: EventCreatedSchema,
  [TOPICS.EVENT_UPDATED]: EventUpdatedSchema,
  [TOPICS.SEAT_RESERVE_REQUESTED]: SeatReserveRequestedSchema,
  [TOPICS.SEAT_RESERVED]: SeatReservedSchema,
  [TOPICS.SEAT_FAILED]: SeatFailedSchema,
  [TOPICS.SEAT_RELEASE]: SeatReleaseSchema,
  [TOPICS.BOOKING_SEAT_HELD]: BookingSeatHeldSchema,
  [TOPICS.PAYMENT_COMPLETED]: PaymentCompletedSchema,
  [TOPICS.PAYMENT_FAILED]: PaymentFailedSchema,
} as const;
