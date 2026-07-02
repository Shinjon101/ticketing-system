import { db } from "@/db";
import { sql, eq, and, inArray, count } from "@ticketing/db";
import { NewSeat, Seat, seats } from "./seat.table";
import { processedEvents } from "./processed-events.table";

type Tx = typeof db;

export const seatRepository = {
  countAvailable: async (eventId: string): Promise<number> => {
    // Migrated: Native Drizzle COUNT query
    const result = await db
      .select({ value: count() })
      .from(seats)
      .where(and(eq(seats.eventId, eventId), eq(seats.status, "available")));

    return result[0].value;
  },

  findById: async (id: string): Promise<Seat | undefined> => {
    const result = await db
      .select()
      .from(seats)
      .where(eq(seats.id, id))
      .limit(1);
    return result[0];
  },

  seedSeatsWithTx: async (
    tx: Tx,
    eventId: string,
    totalSeats: number,
  ): Promise<void> => {
    const values: NewSeat[] = Array.from({ length: totalSeats }, (_, i) => ({
      eventId,
      seatNumber: `Seat ${i + 1}`,
      status: "available" as const,
    }));
    await tx.insert(seats).values(values).onConflictDoNothing();
  },

  pickAndLockSeats: async (
    tx: Tx,
    eventId: string,
    bookingId: string,
    quantity: number,
  ): Promise<Seat[]> => {
    // Migrated: Native Drizzle SELECT FOR UPDATE SKIP LOCKED
    const rows = await tx
      .select()
      .from(seats)
      .where(and(eq(seats.eventId, eventId), eq(seats.status, "available")))
      .orderBy(seats.seatNumber)
      .limit(quantity)
      .for("update", { skipLocked: true });

    if (rows.length < quantity) return [];

    const ids = rows.map((r) => r.id);

    // Migrated: Native Drizzle UPDATE
    await tx
      .update(seats)
      .set({
        status: "held",
        heldBy: bookingId,
        updatedAt: new Date(),
      })
      .where(inArray(seats.id, ids));

    return rows;
  },

  releaseSeats: async (
    tx: Tx,
    seatIds: string[],
    eventId: string,
  ): Promise<number> => {
    // Drizzle throws an error if inArray receives an empty array, so we guard against it
    if (seatIds.length === 0) return 0;

    // Migrated: Native Drizzle UPDATE with .returning() to get the exact row count
    const result = await tx
      .update(seats)
      .set({
        status: "available",
        heldBy: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          inArray(seats.id, seatIds),
          eq(seats.eventId, eventId),
          eq(seats.status, "held"),
        ),
      )
      .returning({ updatedId: seats.id });

    return result.length;
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

  markBookedWithTx: async (tx: Tx, bookingId: string): Promise<number> => {
    const result = await tx
      .update(seats)
      .set({ status: "booked", updatedAt: new Date() })
      .where(and(eq(seats.heldBy, bookingId), eq(seats.status, "held")))
      .returning({ id: seats.id });
    return result.length;
  },
};
