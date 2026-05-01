import { eq, inArray, sql } from "@ticketing/db";
import { db } from "@/db";
import {
  outboxEvents,
  type NewOutboxEvent,
  type OutboxEvent,
} from "./outbox.table";

type Tx = typeof db;

export const outboxRepository = {
  createWithTx: async (tx: Tx, data: NewOutboxEvent): Promise<OutboxEvent> => {
    const [row] = await tx.insert(outboxEvents).values(data).returning();
    return row!;
  },

  fetchUnpublishedBatch: async (
    tx: Tx,
    limit = 100,
  ): Promise<OutboxEvent[]> => {
    return tx
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.published, false))
      .orderBy(outboxEvents.createdAt)
      .limit(limit)
      .for("update", { skipLocked: true }) as Promise<OutboxEvent[]>;
  },

  markPublished: async (tx: Tx, ids: string[]): Promise<void> => {
    if (ids.length === 0) return;
    await tx
      .update(outboxEvents)
      .set({ published: true })
      .where(inArray(outboxEvents.id, ids));
  },
};
