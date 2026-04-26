import { env } from "@/config/env";
import { createDb } from "@ticketing/db";
import * as schema from "./schema";
import logger from "@/config/logger";

export const { connectDB, db, disconnectDB, getPoolStats } = createDb({
  connectionString: env.DATABASE_URL,
  serviceName: "event-service",
  schema: schema,
  logger,
  pool: {
    max: 10,
    statementTimeoutMs: 15_000,
  },
  startup: {
    maxRetries: 3,
    retryDelayMs: 1_000,
  },
});
