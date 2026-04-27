import { db } from "@/db";
import { events } from "./events.table";
import type { Event, NewEvent } from "./events.table";
import { and, desc, eq } from "@ticketing/db";

type Tx = typeof db;

export const eventsRepository = {
  findAll: async (): Promise<Event[]> => {
    return await db
      .select()
      .from(events)
      .where(eq(events.status, "active"))
      .orderBy(desc(events.eventDate));
  },

  findById: async (id: string): Promise<Event> => {
    const result = await db
      .select()
      .from(events)
      .where(eq(events.id, id))
      .limit(1);

    return result[0];
  },

  createWithTx: async (tx: Tx, data: NewEvent): Promise<Event> => {
    const [event] = await tx.insert(events).values(data).returning();
    return event;
  },

  updateWithTx: async (
    tx: Tx,
    id: string,
    data: Partial<Omit<NewEvent, "id" | "createdAt" | "createdBy">>,
  ): Promise<Event | undefined> => {
    const [updated] = await tx
      .update(events)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(events.id, id)))
      .returning();

    return updated;
  },

  cancel: async (id: string): Promise<void> => {
    await db
      .update(events)
      .set({ status: "cancelled" })
      .where(and(eq(events.id, id)));
  },
};
