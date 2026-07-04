import { bookingRepository } from "@/booking/booking.repsoitory";
import { bookings } from "@/booking/booking.table";
import { connectDB, db, disconnectDB } from "@/db";
import { outboxEvents } from "@/outbox/outbox.table";
import { processedEvents } from "@/outbox/processed-events.table";
import { randomUUID } from "crypto";

beforeAll(() => connectDB());
afterEach(async () => {
  await db.delete(bookings);
  await db.delete(outboxEvents);
  await db.delete(processedEvents);
});

describe("idempotency-key uniqueness", () => {
  it("rejects a second insert carrying the same idempotency key", async () => {
    const idempotencyKey = randomUUID();
    const base = {
      userId: randomUUID(),
      eventId: randomUUID(),
      status: "pending" as const,
      amount: 5000,
      idempotencyKey,
    };

    await db.transaction((tx) =>
      bookingRepository.createWithTx(tx as typeof db, base),
    );
    await expect(
      db.transaction((tx) =>
        bookingRepository.createWithTx(tx as typeof db, base),
      ),
    ).rejects.toThrow();
  });
});
