import { db } from "@/db";
import { logger } from "@/config/logger";
import { holds } from "./hold.table";
import { outboxRepository } from "@/outbox/outbox.repository";
import { TOPICS } from "@ticketing/kafka-client";
import { eq, lt, and } from "@ticketing/db";
import crypto from "crypto";

const INTERVAL_MS = 30_000;

let stopRequested = false;

export async function startExpiryJob(): Promise<void> {
  stopRequested = false;
  logger.info({ intervalMs: INTERVAL_MS }, "Hold expiry job started");

  while (!stopRequested) {
    await runExpiryCheck();
    await sleep(INTERVAL_MS);
  }

  logger.info("Hold expiry job stopped");
}

export function stopExpiryJob(): void {
  stopRequested = true;
}

async function runExpiryCheck(): Promise<void> {
  try {
    const expired = await db
      .select()
      .from(holds)
      .where(and(eq(holds.status, "pending"), lt(holds.expiresAt, new Date())));

    if (expired.length === 0) return;

    logger.info(
      { count: expired.length },
      "Found expired holds — publishing payment.failed",
    );

    for (const hold of expired) {
      await db.transaction(async (tx) => {
        await tx
          .update(holds)
          .set({ status: "failed", updatedAt: new Date() })
          .where(eq(holds.bookingId, hold.bookingId));

        await outboxRepository.createWithTx(tx as typeof db, {
          topic: TOPICS.PAYMENT_FAILED,
          payload: {
            messageId: crypto.randomUUID(),
            bookingId: hold.bookingId,
            reason: "hold_expired",
            failedAt: new Date().toISOString(),
          },
        });
      });

      logger.info(
        { bookingId: hold.bookingId },
        "Hold expired — payment.failed queued",
      );
    }
  } catch (err) {
    logger.error({ err }, "Expiry job cycle failed — will retry");
  }
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
