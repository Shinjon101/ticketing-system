import { db } from "@/db";
import logger from "@/config/logger";
import { outboxRepository } from "./outbox.repository";
import type { KafkaProducer, Topic } from "@ticketing/kafka-client";

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
  try {
    await db.transaction(async (tx) => {
      const rows = await outboxRepository.fetchUnpublishedBatch(
        tx as typeof db,
        BATCH_SIZE,
      );

      if (rows.length === 0) return;

      for (const row of rows) {
        await producer.publish(
          row.topic as Topic,
          row.payload as Record<string, unknown>,
          (row.payload as Record<string, string>).bookingId,
        );
      }

      await outboxRepository.markPublished(
        tx as typeof db,
        rows.map((r) => r.id),
      );

      logger.debug({ count: rows.length }, "Outbox batch published");
    });
  } catch (err) {
    logger.error({ err }, "Outbox poll cycle failed :- will retry");
  }
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
