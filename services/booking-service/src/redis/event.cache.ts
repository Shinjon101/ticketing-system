import { redis } from "./index";
import type { EventCreated, EventUpdated } from "@ticketing/kafka-client";

const KEY_PREFIX = "event";

const TTL = {
  ACTIVE: 60 * 60 * 24 * 2, //2 days

  DRAFT: 60 * 60, // 1 hour

  CANCELLED: 60 * 10, // 10 minutes
} as const;

const key = (eventId: string) => `${KEY_PREFIX}:${eventId}`;

export interface CachedEvent {
  eventId: string;
  version: number;
  title: string;
  price: number;
  totalSeats: number;
  eventDate: string;
  saleStartsAt: string | null;
  status: "active" | "draft" | "cancelled";
}

export const eventCache = {
  set: async (event: EventCreated | EventUpdated): Promise<void> => {
    const payload: CachedEvent = {
      eventId: event.eventId,
      version: event.version,
      title: event.title,
      price: event.price,
      totalSeats: event.totalSeats,
      saleStartsAt: event.saleStartsAt?.toISOString() ?? null,
      eventDate: event.eventDate,
      status: event.status,
    };

    const ttl =
      event.status === "active"
        ? TTL.ACTIVE
        : event.status === "draft"
          ? TTL.DRAFT
          : TTL.CANCELLED;

    await redis.eval(
      `
        local current = redis.call("GET", KEYS[1])
        if current then
          local currentVersion = cjson.decode(current).version or -1
          if currentVersion >= tonumber(ARGV[3]) then
            return 0
          end
        end
        redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[2])
        return 1
      `,
      1,
      key(event.eventId),
      JSON.stringify(payload),
      ttl,
      event.version,
    );
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
