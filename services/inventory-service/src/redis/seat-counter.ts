import { redis } from ".";

const key = (eventId: string) => `seats:available:${eventId}`;

export const seatsCounter = {
  seed: async (eventId: string, totalSeats: number): Promise<void> => {
    await redis.setnx(key(eventId), totalSeats);
  },

  decrement: async (eventId: string): Promise<void> => {
    await redis.decr(key(eventId));
  },

  increment: async (eventId: string): Promise<void> => {
    await redis.incr(key(eventId));
  },

  get: async (eventId: string): Promise<number | null> => {
    const val = await redis.get(key(eventId));
    if (val === null) return null;
    return parseInt(val, 10);
  },
};
