import type { Booking } from "@/booking/booking.table";
import { redis } from "./index";

const KEY_PREFIX = "booking";
const DEFAULT_TTL = 60 * 60; //1 hour

const key = (id: string) => `${KEY_PREFIX}:${id}`;

export const bookingCache = {
  async get(id: string): Promise<Booking | null> {
    const data = await redis.get(key(id));
    return data ? JSON.parse(data) : null;
  },

  async set(booking: Booking): Promise<void> {
    await redis.set(
      key(booking.id),
      JSON.stringify(booking),
      "EX",
      DEFAULT_TTL,
    );
  },

  async invalidate(id: string): Promise<void> {
    await redis.del(key(id));
  },
};
