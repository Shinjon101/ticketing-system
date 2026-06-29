import { db } from "@/db";
import { eq } from "@ticketing/db";
import { holds, Hold, NewHold } from "./hold.table";
import { processedEvents } from "@/outbox/processed-events.table";

type Tx = typeof db;

export const holdRepository = {
  findByBookingId: async (bookingId: string): Promise<Hold | undefined> => {
    const result = await db
      .select()
      .from(holds)
      .where(eq(holds.bookingId, bookingId))
      .limit(1);
    return result[0];
  },

  upsertWithTx: async (tx: Tx, data: NewHold): Promise<void> => {
    await tx
      .insert(holds)
      .values(data)
      .onConflictDoUpdate({
        target: holds.bookingId,
        set: {
          status: data.status,
          expiresAt: data.expiresAt,
          updatedAt: new Date(),
        },
      });
  },

  isProcessed: async (messageId: string): Promise<boolean> => {
    const result = await db
      .select()
      .from(processedEvents)
      .where(eq(processedEvents.messageId, messageId))
      .limit(1);
    return result.length > 0;
  },

  markProcessedWithTx: async (
    tx: Tx,
    messageId: string,
    topic: string,
  ): Promise<void> => {
    await tx
      .insert(processedEvents)
      .values({ messageId, topic })
      .onConflictDoNothing();
  },
};
