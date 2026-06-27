import { z, createEnv } from "@ticketing/common";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(4007),
  DATABASE_URL: z.string().url().min(1, "DATABASE_URL is required"),
  JWT_PUBLIC_KEY: z.string().min(1, "JWT_PUBLIC_KEY is required"),
  KAFKA_BROKERS: z.string().min(1, "KAFKA_BROKERS is required"),

  RAZORPAY_KEY_ID: z.string().min(1, "RAZORPAY_KEY_ID is required"),
  RAZORPAY_KEY_SECRET: z.string().min(1, "RAZORPAY_KEY_SECRET is required"),

  RAZORPAY_WEBHOOK_SECRET: z
    .string()
    .min(1, "RAZORPAY_WEBHOOK_SECRET is required"),

  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
});

type EnvType = z.infer<typeof envSchema>;
export const env: EnvType = createEnv(envSchema, {
  serviceName: "payment-service",
});
4;
export type Env = typeof env;
