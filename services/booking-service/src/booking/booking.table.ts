import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "@ticketing/db";

export const bookingStatusEnum = pgEnum("booking_status", [
  "pending",
  "seat_held",
  "payment_initiated",
  "confirmed",
  "failed",
  "cancelled",
]);

export const bookings = pgTable("bookings", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  userId: text("user_id").notNull(),

  eventId: text("event_id").notNull(),

  quantity: integer("quantity").notNull().default(1),

  seatIds: jsonb("seat_ids").$type<string[]>(),
  seatNumbers: jsonb("seat_numbers").$type<string[]>(),

  status: bookingStatusEnum("status").notNull().default("pending"),

  amount: integer("amount").notNull(),

  idempotencyKey: text("idempotency_key").unique(),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;
