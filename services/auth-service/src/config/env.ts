import "dotenv/config";

import { createEnv, z } from "@ticketing/common";

export const envScham = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  PORT: z.coerce.number().default(4003),

  DATABASE_URL: z.url().min(1, "DATABASE_URL is required"),

  JWT_PRIVATE_KEY: z.string().min(1, "JWT_PRIVATE_KEY is required"),
  JWT_PUBLIC_KEY: z.string().min(1, "JWT_PUBLIC_KEY is required"),

  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),

  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),

  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
});

type EnvType = z.infer<typeof envScham>;

export const env: EnvType = createEnv(envScham, {
  serviceName: "auth-service",
});

export type Env = typeof env;
