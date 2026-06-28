import { env } from "@/config/env";
import { logger } from "@/config/logger";
import { createDb } from "@ticketing/db";
import * as schema from "./schema";
export const { connectDB, db, disconnectDB, getPoolStats } = createDb({
  connectionString: env.DATABASE_URL,
  serviceName: "booking-service",
  schema,
  logger,
  pool: {
    max: 10,

    statementTimeoutMs: 10_000,
  },
  startup: { maxRetries: 3, retryDelayMs: 1_000 },
});
