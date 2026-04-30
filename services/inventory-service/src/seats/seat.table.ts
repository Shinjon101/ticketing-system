import { pgEnum, pgTable, text, timestamp } from "@ticketing/db";

export const seatStatusEnum = pgEnum("seat_status", [
  "available",
  "held",
  "booked",
]);

export const seats = pgTable("seats", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  eventId: text("event_id").notNull(),

  seatNumber: text("seat_number").notNull(),

  status: seatStatusEnum("status").notNull().default("available"),

  heldBy: text("held_by"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Seat = typeof seats.$inferSelect;
export type NewSeat = typeof seats.$inferInsert;
