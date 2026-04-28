import { boolean, jsonb, pgTable, text, timestamp } from "@ticketing/db";

export const outboxEvents = pgTable("outbox_events", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  topic: text("topic").notNull(),

  payload: jsonb("payload").notNull(),

  published: boolean("published").notNull().default(false),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type OutboxEvent = typeof outboxEvents.$inferSelect;
export type NewOutboxEvent = typeof outboxEvents.$inferInsert;
