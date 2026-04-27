import { integer, pgEnum, pgTable, text, timestamp } from "@ticketing/db";

export const eventStatusEnum = pgEnum("event_status", [
  "draft",
  "active",
  "cancelled",
]);

export const events = pgTable("evemts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  title: text("title").notNull(),

  description: text("description"),

  venue: text("venue").notNull(),

  eventDate: timestamp("event_date", { withTimezone: true }).notNull(),

  totalSeats: integer("total_seats").notNull(),

  // Price stored in paise (smallest currency unit).
  // Storing as integer avoids floating point precision bugs.
  // ₹500 is stored as 50000. Display layer divides by 100.
  price: integer("price").notNull(),

  saleStartsAt: timestamp("sale_starts_at", { withTimezone: true }),

  status: eventStatusEnum("status").notNull().default("draft"),

  createdBy: text("created_by").notNull(),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
