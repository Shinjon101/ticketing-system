import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "@ticketing/db";

export const holdStatusEnum = pgEnum("hold_status", [
  "pending", // seat held, awaiting payment
  "completed", // payment succeeded
  "failed", // payment failed or expired
]);

export const holds = pgTable("holds", {
  bookingId: text("booking_id").primaryKey(),
  userId: text("user_id").notNull(),
  eventId: text("event_id").notNull(),
  seatIds: jsonb("seat_ids").$type<string[]>().notNull(),
  seatNumbers: jsonb("seat_numbers").$type<string[]>().notNull(),
  amount: integer("amount").notNull(),
  razorpayOrderId: text("razorpay_order_id"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  status: holdStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Hold = typeof holds.$inferSelect;
export type NewHold = typeof holds.$inferInsert;
