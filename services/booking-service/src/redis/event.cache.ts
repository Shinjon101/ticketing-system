import { redis } from "./index";
import type { EventCreated } from "@ticketing/kafka-client";

const KEY_PREFIX = "event";

const TTL = {
  ACTIVE: 60 * 60 * 24 * 2, //2 days

  DRAFT: 60 * 60, // 1 hour

  CANCELLED: 60 * 10, // 10 minutes
} as const;

const key = (eventId: string) => `${KEY_PREFIX}:${eventId}`;

export interface CachedEvent {
  eventId: string;
  title: string;
  price: number;
  totalSeats: number;
  eventDate: string;
  saleStartsAt: Date | null;
  status: "active" | "draft" | "cancelled";
}

export const eventCache = {
  set: async (event: EventCreated): Promise<void> => {
    const payload: CachedEvent = {
      eventId: event.eventId,
      title: event.title,
      price: event.price,
      totalSeats: event.totalSeats,
      saleStartsAt: event.saleStartsAt ?? null,
      eventDate: event.eventDate,
      status: event.status,
    };

    const ttl =
      event.status === "active"
        ? TTL.ACTIVE
        : event.status === "draft"
          ? TTL.DRAFT
          : TTL.CANCELLED;

    await redis.set(key(event.eventId), JSON.stringify(payload), "EX", ttl);
  },

  get: async (eventId: string): Promise<CachedEvent | null> => {
    const raw = await redis.get(key(eventId));
    if (!raw) return null;
    return JSON.parse(raw) as CachedEvent;
  },

  del: async (eventId: string): Promise<void> => {
    await redis.del(key(eventId));
  },
};
