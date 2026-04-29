import "dotenv/config";
import { createEnv, z } from "@ticketing/common";

export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  PORT: z.coerce.number().default(4004),

  DATABASE_URL: z.url().min(1, "DATABASE_URL is required"),

  JWT_PUBLIC_KEY: z.string().min(1, "JWT_PUBLIC_KEY is required"),

  KAFKA_BROKERS: z.string().min(1, "KAFKA_BROKERS is required"),

  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
});

type EnvType = z.infer<typeof envSchema>;

export const env: EnvType = createEnv(envSchema, {
  serviceName: "event-service",
});

export type Env = typeof env;
