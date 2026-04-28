import { db } from "@/db";
import { eq } from "@ticketing/db";
import { Booking, bookings, NewBooking } from "./booking.table";
import { processedEvents } from "@/outbox/processed-events.table";

type Tx = typeof db;

export const bookingRepository = {
  findById: async (id: string): Promise<Booking | undefined> => {
    const result = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, id))
      .limit(1);
    return result[0];
  },

  findByUserId: async (userId: string): Promise<Booking[]> => {
    return db
      .select()
      .from(bookings)
      .where(eq(bookings.userId, userId))
      .orderBy(bookings.createdAt);
  },

  createWithTx: async (tx: Tx, data: NewBooking): Promise<Booking> => {
    const [booking] = await tx.insert(bookings).values(data).returning();
    return booking!;
  },

  updateWithTx: async (
    tx: Tx,
    id: string,
    data: Partial<Pick<Booking, "seatId" | "status" | "seatNumber">>,
  ): Promise<Booking | undefined> => {
    const [updated] = await tx
      .update(bookings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(bookings.id, id))
      .returning();
    return updated;
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
