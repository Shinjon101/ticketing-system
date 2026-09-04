import { and, lt, inArray, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { Logger } from "pino";

export interface BatchDeleteConfig<TTable extends PgTable> {
  // Drizzle table object to delete from
  table: TTable;

  // Primary key column, used to build the DELETE
  idColumn: PgColumn;

  // Column to compare against the retention cutoff
  timestampColumn: PgColumn;

  // Rows older than this are eligible for deletion
  cutoff: Date;

  /**
   * Extra safety condition, e.g. eq(outboxEvents.published, true).
   * Combined with the cutoff via AND.
   */
  extraCondition?: SQL;

  // Rows deleted per transaction. Default 5000.
  batchSize?: number;

  // Delay between batches in ms, to let autovacuum/replicas breathe. Default 100.
  delayMs?: number;

  // Label used in log lines
  label: string;

  logger?: Logger;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function batchDeleteOlderThan<TTable extends PgTable>(
  db: NodePgDatabase,
  config: BatchDeleteConfig<TTable>,
): Promise<number> {
  const {
    table,
    idColumn,
    timestampColumn,
    cutoff,
    extraCondition,
    batchSize = 5000,
    delayMs = 100,
    label,
    logger,
  } = config;

  const whereClause = extraCondition
    ? and(extraCondition, lt(timestampColumn, cutoff))
    : lt(timestampColumn, cutoff);

  let totalDeleted = 0;

  while (true) {
    const idsToDelete = db
      .select({ id: idColumn })
      .from(table as PgTable)
      .where(whereClause)
      .orderBy(timestampColumn)
      .limit(batchSize);

    const result = await db
      .delete(table as PgTable)
      .where(inArray(idColumn, idsToDelete))
      .returning({ id: idColumn });

    totalDeleted += result.length;
    logger?.info(
      { label, batchDeleted: result.length, totalDeleted },
      "Cleanup batch complete",
    );

    if (result.length < batchSize) break;
    await sleep(delayMs);
  }

  logger?.info({ label, totalDeleted, cutoff }, "Cleanup finished");
  return totalDeleted;
}
