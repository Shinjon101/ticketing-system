import { db } from "@/db";
import { eq, sql } from "@ticketing/db";
import { NewOutboxEvent, OutboxEvent, outboxEvents } from "./outbox.table";

export const outboxRepository = {
  createWithTx: async (
    tx: typeof db,
    data: NewOutboxEvent,
  ): Promise<OutboxEvent> => {
    const [row] = await tx.insert(outboxEvents).values(data).returning();
    return row!;
  },

  fetchUnpublishedBatch: async (
    tx: typeof db,
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

  markPublished: async (tx: typeof db, ids: string[]): Promise<void> => {
    if (ids.length == 0) return;
    await tx
      .update(outboxEvents)
      .set({ published: true })
      .where(sql`${outboxEvents.id} = ANY(${ids})`);
  },
};
