import { env } from "@/config/env";
import { createDb } from "@ticketing/db";
import * as schema from "./schema";
import logger from "@/config/logger";

export const { connectDB, db, disconnectDB, getPoolStats } = createDb({
  connectionString: env.DATABASE_URL,
  serviceName: "booking-service",
  schema,
  logger,
  pool: {
    // Higher pool size than auth/event because of concurrent saga transactions.
    max: 20,

    statementTimeoutMs: 15_000,
  },
  startup: { maxRetries: 3, retryDelayMs: 1_000 },
});
