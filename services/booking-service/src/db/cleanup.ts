import { drizzle, batchDeleteOlderThan, eq } from "@ticketing/db";
import { Pool } from "pg";
import "dotenv/config";
import { outboxEvents } from "@/outbox/outbox.table";
import { processedEvents } from "@/outbox/processed-events.table";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL environment variable is required");
  process.exit(1);
}

const OUTBOX_RETENTION_DAYS = Number(process.env.OUTBOX_RETENTION_DAYS ?? 7);
const PROCESSED_EVENTS_RETENTION_DAYS = Number(
  process.env.PROCESSED_EVENTS_RETENTION_DAYS ?? 14,
);

const pool = new Pool({ connectionString });
const db = drizzle({ client: pool });

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

const run = async () => {
  console.log("Running cleanup...");

  const outboxDeleted = await batchDeleteOlderThan(db, {
    table: outboxEvents,
    idColumn: outboxEvents.id,
    timestampColumn: outboxEvents.createdAt,
    cutoff: daysAgo(OUTBOX_RETENTION_DAYS),
    extraCondition: eq(outboxEvents.published, true),
    label: "outbox_events",
  });

  const processedDeleted = await batchDeleteOlderThan(db, {
    table: processedEvents,
    idColumn: processedEvents.messageId,
    timestampColumn: processedEvents.processedAt,
    cutoff: daysAgo(PROCESSED_EVENTS_RETENTION_DAYS),
    label: "processed_events",
  });

  console.log(
    `Cleanup complete. outbox_events: ${outboxDeleted}, processed_events: ${processedDeleted}`,
  );
};

try {
  await run();
} catch (error) {
  console.error("Cleanup failed", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
