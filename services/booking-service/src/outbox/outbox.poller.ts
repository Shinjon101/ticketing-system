import { db } from "@/db";
import { logger } from "@/config/logger";
import { outboxMetrics } from "@/metrics";
import { outboxRepository } from "./outbox.repository";
import type { KafkaProducer } from "@ticketing/kafka-client";
import type { OutboxCycleResult } from "@ticketing/common";

const POLL_INTERVAL_MS = 500;
const BATCH_SIZE = 100;

let stopRequested = false;

export async function startOutboxPoller(
  producer: KafkaProducer,
): Promise<void> {
  stopRequested = false;
  logger.info({ intervalMs: POLL_INTERVAL_MS }, "Outbox poller started");

  while (!stopRequested) {
    await poll(producer);
    await sleep(POLL_INTERVAL_MS);
  }

  logger.info("Outbox poller stopped");
}

export function stopOutboxPoller(): void {
  stopRequested = true;
}

async function poll(producer: KafkaProducer): Promise<void> {
  const endCycle = outboxMetrics.startCycle();
  const published: Array<{ topic: string; createdAt: Date; at: number }> = [];
  let result: OutboxCycleResult = "empty";

  try {
    await db.transaction(async (tx) => {
      const rows = await outboxRepository.fetchUnpublishedBatch(tx, BATCH_SIZE);

      if (rows.length === 0) return;

      for (const row of rows) {
        await producer.publish(row.topic, row.payload, row.payload.bookingId);
        published.push({
          topic: row.topic,
          createdAt: row.createdAt,
          at: Date.now(),
        });
      }

      await outboxRepository.markPublished(
        tx,
        rows.map((r) => r.id),
      );

      result = rows.length === BATCH_SIZE ? "full" : "partial";
      logger.debug({ count: rows.length }, "Outbox batch published");
    });

    // Recorded only after commit. If the transaction rolls back these rows are
    // published again next cycle and measured then.
    for (const event of published) {
      outboxMetrics.observePublished(event.topic, event.createdAt, event.at);
    }
  } catch (err) {
    result = "error";
    logger.error({ err }, "Outbox poll cycle failed :- will retry");
  } finally {
    endCycle(result);
  }
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
