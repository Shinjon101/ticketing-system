import logger from "@/config/logger";
import { db } from "@/db";
import type { KafkaProducer, Topic } from "@ticketing/kafka-client";
import { outboxRepository } from "./outbox.repository";

const POLL_INTERVAL_MS = 500;
const BATCH_SIZE = 100;

let running = false;
let stopRequested = false;

export async function startOutboxPoller(
  producer: KafkaProducer,
): Promise<void> {
  if (running) {
    logger.warn("Outbox poller already running- skipping duplicate start");
    return;
  }
  running = true;
  stopRequested = false;
  logger.info(
    { intervalMs: POLL_INTERVAL_MS, batchSize: BATCH_SIZE },
    "Outbox poller started",
  );

  while (!stopRequested) {
    await poll(producer);
    await sleep(POLL_INTERVAL_MS);
  }

  running = false;
  logger.info("Outbox poller stopped");
}

export function stopOutboxPoller(): void {
  stopRequested = true;
}

async function poll(producer: KafkaProducer): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      const rows = await outboxRepository.fetchUnpublishedBatch(
        tx as typeof db,
        BATCH_SIZE,
      );
      if (rows.length === 0) return;

      logger.debug({ count: rows.length }, "Outbox poller: publishing batch");

      for (const row of rows) {
        await producer.publish(
          row.topic as Topic,
          row.payload as Record<string, unknown>,
          (row.payload as Record<string, string>).eventId,
        );
      }

      await outboxRepository.markPublished(
        tx as typeof db,
        rows.map((r) => r.id),
      );

      logger.info({ count: rows.length }, "Outbox poller: batch published");
    });
  } catch (err) {
    logger.error({ err }, "Outbox poller: poll cycle failed: will retry");
  }
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
