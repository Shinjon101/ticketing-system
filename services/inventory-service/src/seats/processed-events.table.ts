import { pgTable, text, timestamp } from "@ticketing/db";

export const processedEvents = pgTable("processed_events", {
  messageId: text("message_id").primaryKey(),
  topic: text("topic").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ProcessedEvent = typeof processedEvents.$inferSelect;
