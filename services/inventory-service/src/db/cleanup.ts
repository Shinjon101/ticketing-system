import { batchDeleteOlderThan, drizzle, eq } from "@ticketing/db";
import { createEnv, createLogger, logLevelSchema, z } from "@ticketing/common";
import { Pool } from "pg";
import "dotenv/config";
import { outboxEvents } from "@/outbox/outbox.table";
import { processedEvents } from "@/seats/processed-events.table";

const JOB_NAME = "inventory-service-cleanup";

const env = createEnv(
  z.object({
    DATABASE_URL: z.string().url(),
    LOG_LEVEL: logLevelSchema.default("info"),
    OUTBOX_RETENTION_DAYS: z.coerce.number().int().positive().default(7),
    PROCESSED_EVENTS_RETENTION_DAYS: z.coerce
      .number()
      .int()
      .positive()
      .default(14),
  }),
  { serviceName: JOB_NAME },
);

const logger = createLogger({ name: JOB_NAME, level: env.LOG_LEVEL });

const pool = new Pool({ connectionString: env.DATABASE_URL });
const db = drizzle({ client: pool });

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

const run = async () => {
  logger.info("Running cleanup");

  const outboxDeleted = await batchDeleteOlderThan(db, {
    table: outboxEvents,
    idColumn: outboxEvents.id,
    timestampColumn: outboxEvents.createdAt,
    cutoff: daysAgo(env.OUTBOX_RETENTION_DAYS),
    extraCondition: eq(outboxEvents.published, true),
    label: "outbox_events",
    logger,
  });

  const processedDeleted = await batchDeleteOlderThan(db, {
    table: processedEvents,
    idColumn: processedEvents.messageId,
    timestampColumn: processedEvents.processedAt,
    cutoff: daysAgo(env.PROCESSED_EVENTS_RETENTION_DAYS),
    label: "processed_events",
    logger,
  });

  logger.info({ outboxDeleted, processedDeleted }, "Cleanup complete");
};

try {
  await run();
} catch (err) {
  logger.error({ err }, "Cleanup failed");
  process.exitCode = 1;
} finally {
  await pool.end();
}
