import { redis } from "@/redis";
import type { Event } from "./events.table";
const KEYS = {
  LIST: "event:active",
  DETAIL: (id: string) => `event:detail:${id}`,
};

const TTL = {
  LIST: 60 * 5, // 5 minutes
  DETAIL: 60 * 60 * 24, // 24 hours
};

export const eventsCache = {
  async getList(): Promise<Event[] | null> {
    const data = await redis.get(KEYS.LIST);
    return data ? JSON.parse(data) : null;
  },

  async setList(events: Event[]): Promise<void> {
    await redis.set(KEYS.LIST, JSON.stringify(events), "EX", TTL.LIST);
  },

  async invalidateList(): Promise<void> {
    await redis.del(KEYS.LIST);
  },

  async getDetail(id: string): Promise<Event | null> {
    const data = await redis.get(KEYS.DETAIL(id));
    return data ? JSON.parse(data) : null;
  },

  async setDetail(event: Event): Promise<void> {
    await redis.set(
      KEYS.DETAIL(event.id),
      JSON.stringify(event),
      "EX",
      TTL.DETAIL,
    );
  },

  async invalidateDetail(id: string): Promise<void> {
    await redis.del(KEYS.DETAIL(id));
    await redis.del(KEYS.LIST);
  },
};
