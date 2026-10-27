import { boolean, jsonb, pgTable, text, timestamp } from "@ticketing/db";
import type { Topic } from "@ticketing/kafka-client";

// Every outbox row carries the Kafka partition key the poller publishes with.
type OutboxPayload = Record<string, unknown> & { bookingId: string };

export const outboxEvents = pgTable("outbox_events", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  topic: text("topic").$type<Topic>().notNull(),

  payload: jsonb("payload").$type<OutboxPayload>().notNull(),

  published: boolean("published").notNull().default(false),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type OutboxEvent = typeof outboxEvents.$inferSelect;
export type NewOutboxEvent = typeof outboxEvents.$inferInsert;
