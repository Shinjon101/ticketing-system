import { redis } from "./index";

const KEY_PREFIX = "idempotency";
const TTL_SECONDS = 60 * 60 * 24; //24 hours

const key = (clientId: string) => `${KEY_PREFIX}:${clientId}`;

export const idempotencyCache = {
  claim: async (clientKey: string, bookingId: string): Promise<boolean> => {
    const result = await redis.set(
      key(clientKey),
      bookingId,
      "EX",
      TTL_SECONDS,
      "NX",
    );

    return result === "OK";
  },

  get: async (clientKey: string): Promise<string | null> => {
    return redis.get(key(clientKey));
  },
};
