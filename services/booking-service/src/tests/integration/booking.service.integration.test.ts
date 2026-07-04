vi.mock("@/redis/event.cache", () => ({
  eventCache: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
}));
vi.mock("@/redis/idempotency", () => ({
  idempotencyCache: { get: vi.fn(), claim: vi.fn() },
}));
vi.mock("@/redis/booking.cache", () => ({
  bookingCache: { get: vi.fn(), set: vi.fn(), invalidate: vi.fn() },
}));

import { randomUUID } from "crypto";
import { eq } from "@ticketing/db";
import { connectDB, db, disconnectDB } from "@/db";
import { bookings } from "@/booking/booking.table";
import { outboxEvents } from "@/outbox/outbox.table";
import { processedEvents } from "@/outbox/processed-events.table";
import { bookingRepository } from "@/booking/booking.repsoitory";
import { bookingService } from "@/booking/booking.service";
import { eventCache } from "@/redis/event.cache";
import { idempotencyCache } from "@/redis/idempotency";
import { TOPICS } from "@ticketing/kafka-client";

beforeAll(() => connectDB());
afterEach(async () => {
  vi.clearAllMocks();
  await db.delete(bookings);
  await db.delete(outboxEvents);
  await db.delete(processedEvents);
});

describe("bookingService.create: concurrent duplicate submissions", () => {
  it("two requests racing past the Redis check still resolve to a single booking row", async () => {
    const idempotencyKey = randomUUID();
    const eventId = randomUUID();
    const userId = randomUUID();

    vi.mocked(eventCache.get).mockResolvedValue({
      eventId,
      title: "Race Test Event",
      price: 5000,
      totalSeats: 10,
      eventDate: new Date(Date.now() + 86_400_000).toISOString(),
      saleStartsAt: new Date(Date.now() - 1000),
      status: "active",
    });

    vi.mocked(idempotencyCache.get).mockResolvedValue(null);
    vi.mocked(idempotencyCache.claim).mockResolvedValue(true);

    const input = { userId, eventId, idempotencyKey, quantity: 1 };
    const [a, b] = await Promise.all([
      bookingService.create(input),
      bookingService.create(input),
    ]);
    const rows = await db
      .select()
      .from(bookings)
      .where(eq(bookings.idempotencyKey, idempotencyKey));

    expect(a.id).toBe(b.id);
    expect(rows).toHaveLength(1);
  });
});

describe("bookingService — Kafka redelivery safety", () => {
  it("a redelivered seat.reserved message does not double-transition or double-queue", async () => {
    const bookingId = randomUUID();
    await db.transaction((tx) =>
      bookingRepository.createWithTx(tx as typeof db, {
        id: bookingId,
        userId: randomUUID(),
        eventId: randomUUID(),
        status: "pending",
        amount: 5000,
        idempotencyKey: randomUUID(),
      }),
    );

    const msg = {
      messageId: randomUUID(),
      bookingId,
      seatIds: ["seat-1"],
      seatNumbers: ["Seat 1"],
      reservedAt: new Date().toISOString(),
    };

    await bookingService.onSeatReserved(msg);
    await bookingService.onSeatReserved(msg); // simulated redelivery

    const [booking] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingId));
    expect(booking.status).toBe("seat_held");

    const outboxRows = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.topic, TOPICS.BOOKING_SEAT_HELD));
    expect(outboxRows).toHaveLength(1);
  });
});

describe("bookingService.onPaymentFailed — compensation correctness against real DB", () => {
  it("queues a real SEAT_RELEASE row when the booking held seats", async () => {
    const bookingId = randomUUID();
    await db.transaction((tx) =>
      bookingRepository.createWithTx(tx as typeof db, {
        id: bookingId,
        userId: randomUUID(),
        eventId: randomUUID(),
        status: "seat_held",
        amount: 5000,
        idempotencyKey: randomUUID(),
        seatIds: ["seat-1", "seat-2"],
        seatNumbers: ["Seat 1", "Seat 2"],
      }),
    );

    await bookingService.onPaymentFailed({
      messageId: randomUUID(),
      bookingId,
      reason: "payment_declined",
      failedAt: new Date().toISOString(),
    });

    const [booking] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingId));
    expect(booking.status).toBe("failed");

    const [releaseRow] = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.topic, TOPICS.SEAT_RELEASE));
    expect(releaseRow).toBeDefined();
    expect((releaseRow.payload as { seatIds: string[] }).seatIds).toEqual([
      "seat-1",
      "seat-2",
    ]);
  });

  it("does not queue SEAT_RELEASE when the booking never held seats", async () => {
    const bookingId = randomUUID();
    await db.transaction((tx) =>
      bookingRepository.createWithTx(tx as typeof db, {
        id: bookingId,
        userId: randomUUID(),
        eventId: randomUUID(),
        status: "pending",
        amount: 5000,
        idempotencyKey: randomUUID(),
      }),
    );

    await bookingService.onPaymentFailed({
      messageId: randomUUID(),
      bookingId,
      reason: "hold_expired",
      failedAt: new Date().toISOString(),
    });

    const releaseRows = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.topic, TOPICS.SEAT_RELEASE));
    expect(releaseRows).toHaveLength(0);
  });
});
