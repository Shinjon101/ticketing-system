import { HttpError } from "@ticketing/common";
import { eventsRepository } from "./events.repository";
import { Event } from "./events.table";
import { db } from "@/db";
import { outboxRepository } from "@/outbox/outbox.repository";
import { TOPICS } from "@ticketing/kafka-client";
import { eventsCache } from "./events.cache";

export interface CreateEventInput {
  title: string;
  description?: string;
  venue: string;
  eventDate: Date;
  totalSeats: number;
  price: number; // in paise
  saleStartsAt?: Date;
  createdBy: string; // userId from JWT — for audit trail
}

export interface UpdateEventInput {
  title?: string;
  description?: string;
  venue?: string;
  eventDate?: Date;
  totalSeats?: number;
  price?: number;
  saleStartsAt?: Date;
  status?: "draft" | "active" | "cancelled";
}

export const eventService = {
  getAll: async (): Promise<Event[]> => {
    const cached = await eventsCache.getList();
    if (cached) return cached;

    const events = await eventsRepository.findAll();

    await eventsCache.setList(events);

    return events;
  },

  getById: async (id: string): Promise<Event> => {
    const cached = await eventsCache.getDetail(id);
    if (cached) return cached;

    const event = await eventsRepository.findById(id);
    if (!event) throw new HttpError(404, "Event not found");

    await eventsCache.setDetail(event);
    return event;
  },

  create: async (input: CreateEventInput): Promise<Event> => {
    let created!: Event;

    await db.transaction(async (tx) => {
      created = await eventsRepository.createWithTx(tx as typeof db, input);

      await outboxRepository.createWithTx(tx as typeof db, {
        topic: TOPICS.EVENT_CREATED,
        payload: {
          messageId: crypto.randomUUID(),
          eventId: created.id,
          title: created.title,
          totalSeats: created.totalSeats,
          price: created.price,
          saleStartsAt: created.saleStartsAt?.toISOString() ?? null,
          eventDate: created.eventDate.toISOString(),
          status: created.status,
        },
      });
    });

    await eventsCache.invalidateList();
    return created;
  },

  update: async (id: string, input: UpdateEventInput): Promise<Event> => {
    const existing = await eventsRepository.findById(id);
    if (!existing) throw new HttpError(404, "Event not found");

    if (existing.status === "cancelled")
      throw new HttpError(400, "Cannot update a cancelled event");

    let updated!: Event;

    await db.transaction(async (tx) => {
      const result = await eventsRepository.updateWithTx(
        tx as typeof db,
        id,
        input,
      );
      if (!result) throw new HttpError(404, "Event not found");
      updated = result;

      await outboxRepository.createWithTx(tx as typeof db, {
        topic: TOPICS.EVENT_UPDATED,
        payload: {
          messageId: crypto.randomUUID(),
          eventId: id,
          changes: input,
        },
      });
    });

    await eventsCache.invalidateDetail(id);
    return updated;
  },

  /* Cancel is treated as a special case of update Booking Service gets
  an event.updated message with status: "cancelled" and can
  invalidate its Redis cache and reject new bookings immediately. */

  cancel: async (id: string): Promise<void> => {
    const existing = await eventsRepository.findById(id);
    if (!existing) throw new HttpError(404, "Event not found");
    if (existing.status === "cancelled") {
      throw new HttpError(400, "Event is already cancelled");
    }

    await db.transaction(async (tx) => {
      await eventsRepository.updateWithTx(tx as typeof db, id, {
        status: "cancelled",
      });

      await outboxRepository.createWithTx(tx as typeof db, {
        topic: TOPICS.EVENT_UPDATED,
        payload: {
          messageId: crypto.randomUUID(),
          eventId: id,
          changes: { status: "cancelled" },
        },
      });
    });
    await eventsCache.invalidateDetail(id);
  },
};
