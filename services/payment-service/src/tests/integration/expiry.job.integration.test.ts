import { randomUUID } from "crypto";
import { eq } from "@ticketing/db";
import { connectDB, db } from "@/db";
import { holds } from "@/payment/hold.table";
import { outboxEvents } from "@/outbox/outbox.table";
import { holdRepository } from "@/payment/hold.repository";
import { runExpiryCheck } from "@/payment/expiry.job";
import { TOPICS } from "@ticketing/kafka-client";

beforeAll(() => connectDB());
afterEach(async () => {
  await db.delete(holds);
  await db.delete(outboxEvents);
});

const seedHold = (status: "pending" | "completed", expiresAt: Date) =>
  db.transaction((tx) =>
    holdRepository.upsertWithTx(tx as typeof db, {
      bookingId: randomUUID(),
      userId: randomUUID(),
      eventId: randomUUID(),
      seatIds: ["seat-1"],
      seatNumbers: ["Seat 1"],
      amount: 5000,
      expiresAt,
      status,
    }),
  );

describe("runExpiryCheck", () => {
  it("fails expired pending holds and queues PAYMENT_FAILED", async () => {
    await seedHold("pending", new Date(Date.now() - 1000));
    await runExpiryCheck();

    const rows = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.topic, TOPICS.PAYMENT_FAILED));
    expect(rows).toHaveLength(1);
    expect((rows[0].payload as { reason: string }).reason).toBe("hold_expired");
  });

  it("leaves not-yet-expired holds untouched", async () => {
    await seedHold("pending", new Date(Date.now() + 60_000));
    await runExpiryCheck();

    const rows = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.topic, TOPICS.PAYMENT_FAILED));
    expect(rows).toHaveLength(0);
  });

  it("never touches an already-completed hold, even if its expiresAt has passed", async () => {
    // Proves the query's own status filter is the safety net — not incidental timing.
    await seedHold("completed", new Date(Date.now() - 1000));
    await runExpiryCheck();

    const rows = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.topic, TOPICS.PAYMENT_FAILED));
    expect(rows).toHaveLength(0);
  });
});
