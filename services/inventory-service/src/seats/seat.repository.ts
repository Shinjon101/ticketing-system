import { db } from "@/db";
import { sql, eq } from "@ticketing/db";
import { NewSeat, Seat, seats } from "./seat.table";
import { processedEvents } from "./processed-events.table";

type Tx = typeof db;

export const seatRepository = {
  countAvailable: async (eventId: string): Promise<number> => {
    const result = await db.execute(
      sql`SELECT COUNT(*) as count FROM seats WHERE event_id = ${eventId} AND status = 'available'`,
    );

    return parseInt((result.rows[0] as { count: string }).count, 10);
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

  pickAndLockSeat: async (
    tx: Tx,
    eventId: string,
    bookingId: string,
  ): Promise<Seat | undefined> => {
    const result = await tx.execute(sql`
      SELECT * FROM seats
      WHERE event_id = ${eventId}
      AND status = 'available'
      ORDER BY seat_number
      LIMIT 1
      FOR UPDATE SKIP LOCKED
      `);
    if (result.rows.length === 0) return undefined;

    const row = result.rows[0] as Seat;

    await tx.execute(sql`
      UPDATE seats
      SET status = 'held',
          held_by = ${bookingId},
          updated_at = NOW()
      WHERE id = ${row.id}
    `);

    return row;
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
