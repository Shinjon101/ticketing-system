import Redis from "ioredis";
import { env } from "@/config/env";
import logger from "@/config/logger";

export const redis = new Redis(env.REDIS_URL, {
  retryStrategy(times) {
    const delay = Math.min(times * 100, 3_000);
    logger.warn({ attempt: times, delayMs: delay }, "Redis reconnecting");
    return delay;
  },

  maxRetriesPerRequest: 3,

  enableOfflineQueue: true,

  lazyConnect: true,
});

redis.on("connect", () => {
  logger.info("Redis connected");
});

redis.on("error", (err) => {
  logger.error({ err }, "Redis error");
});

redis.on("close", () => {
  logger.warn("Redis connection closed");
});

export const connectRedis = async (): Promise<void> => {
  await redis.connect();
};

export const disconnectRedis = async (): Promise<void> => {
  await redis.quit();
  logger.info("Redis disconnected");
};
