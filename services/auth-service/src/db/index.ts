import { createDb } from "@ticketing/db";
import { env } from "@/config/env";
import logger from "@/config/logger";
import * as schema from "./schema";

export const { connectDB, db, disconnectDB, getPoolStats } = createDb({
  connectionString: env.DATABASE_URL,
  serviceName: "auth-service",
  schema: schema,
  logger,
  pool: {
    max: 10,
    statementTimeoutMs: 10_000,
  },
  startup: {
    maxRetries: 3,
    retryDelayMs: 1_000,
  },
});

export type { NodePgDatabase } from "drizzle-orm/node-postgres";
