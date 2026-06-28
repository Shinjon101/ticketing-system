import { integer, pgEnum, pgTable, text, timestamp } from "@ticketing/db";

export const paymentStatusEnum = pgEnum("payment_status", [
  "created",
  "captured",
  "failed",
]);

export const payments = pgTable("payments", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  bookingId: text("booking_id").notNull().unique(),

  razorpayOrderId: text("razorpay_order_id").notNull().unique(),
  razorpayPaymentId: text("razorpay_payment_id"),
  razorpaySignature: text("razorpay_signature"),

  amount: integer("amount").notNull(),
  currency: text("currency").notNull().default("INR"),

  status: paymentStatusEnum("status").notNull().default("created"),
  failureReason: text("failure_reason"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
