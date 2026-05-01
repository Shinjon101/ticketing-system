import { env } from "@/config/env";
import { createDb } from "@ticketing/db";
import { logger } from "@/config/logger";
import * as schema from "./schema";

export const { connectDB, db, disconnectDB, getPoolStats } = createDb({
  connectionString: env.DATABASE_URL,
  serviceName: "inventory-service",
  schema,
  logger,
  pool: {
    max: 20,
    statementTimeoutMs: 10_000,
  },
  startup: {
    maxRetries: 3,
    retryDelayMs: 1_000,
  },
});
