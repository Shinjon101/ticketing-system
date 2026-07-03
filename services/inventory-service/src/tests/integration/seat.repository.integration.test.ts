import { connectDB, db, disconnectDB } from "@/db";
import { processedEvents } from "@/seats/processed-events.table";
import { seatRepository } from "@/seats/seat.repository";
import { seats } from "@/seats/seat.table";
import { randomUUID } from "crypto";
import { eq } from "@ticketing/db";

beforeAll(() => connectDB());
afterAll(() => disconnectDB());
afterEach(async () => {
  await db.delete(seats);
  await db.delete(processedEvents);
});

describe("seatRepository.pickAndLockSeats: concurrency correctness", () => {
  it("never assigns the same seat to two concurrent requests", async () => {
    const eventId = randomUUID();
    await db.transaction((tx) =>
      seatRepository.seedSeatsWithTx(tx as typeof db, eventId, 10),
    );

    const attempts = Array.from({ length: 20 }, (_, i) =>
      db.transaction((tx) =>
        seatRepository.pickAndLockSeats(
          tx as typeof db,
          eventId,
          `booking-${i}`,
          1,
        ),
      ),
    );

    const results = await Promise.all(attempts);
    const wonSeatIds = results.flat().map((s) => s.id);

    expect(new Set(wonSeatIds).size).toBe(wonSeatIds.length);
    expect(wonSeatIds.length).toBeLessThanOrEqual(10);

    expect(results.filter((r) => r.length === 1)).toHaveLength(10);
    expect(results.filter((r) => r.length === 0)).toHaveLength(10);

    const finalSeats = await db
      .select()
      .from(seats)
      .where(eq(seats.eventId, eventId));
    expect(finalSeats.filter((s) => s.status === "held")).toHaveLength(10);
    expect(finalSeats.filter((s) => s.status === "available")).toHaveLength(0);
  });

  it("is all-or-nothing per request when demand exceeds supply", async () => {
    const eventId = randomUUID();
    await db.transaction((tx) =>
      seatRepository.seedSeatsWithTx(tx as typeof db, eventId, 5),
    );

    // 3x2 = 6 seats requested, but only 5 available.

    const attempts = Array.from({ length: 3 }, (_, i) =>
      db.transaction((tx) =>
        seatRepository.pickAndLockSeats(
          tx as typeof db,
          eventId,
          `booking-${i}`,
          2,
        ),
      ),
    );
    const results = await Promise.all(attempts);

    for (const result of results) expect([0, 2]).toContain(result.length);

    const wonSeatIds = results.flat().map((s) => s.id);
    expect(new Set(wonSeatIds).size).toBe(wonSeatIds.length); //no duplicates

    expect(results.filter((r) => r.length === 2)).toHaveLength(2);
    expect(results.filter((r) => r.length === 0)).toHaveLength(1);
  });
});

describe("seat state machine transitions", () => {
  it("markBookedWithTx only books seats held by the given booking", async () => {
    const eventId = randomUUID();
    await db.transaction((tx) =>
      seatRepository.seedSeatsWithTx(tx as typeof db, eventId, 4),
    );

    await Promise.all([
      db.transaction((tx) =>
        seatRepository.pickAndLockSeats(
          tx as typeof db,
          eventId,
          "booking-a",
          2,
        ),
      ),
      db.transaction((tx) =>
        seatRepository.pickAndLockSeats(
          tx as typeof db,
          eventId,
          "booking-b",
          2,
        ),
      ),
    ]);

    const bookedCount = await db.transaction((tx) =>
      seatRepository.markBookedWithTx(tx as typeof db, "booking-a"),
    );

    expect(bookedCount).toBe(2);

    const allSeats = await db
      .select()
      .from(seats)
      .where(eq(seats.eventId, eventId));

    const byBooking = (id: string) => allSeats.filter((s) => s.heldBy === id);

    expect(byBooking("booking-a").every((s) => s.status === "booked")).toBe(
      true,
    );
    expect(byBooking("booking-b").every((s) => s.status === "held")).toBe(true);
  });

  it("releaseSeats only releases seats currently in 'held' state", async () => {
    const eventId = randomUUID();
    await db.transaction((tx) =>
      seatRepository.seedSeatsWithTx(tx as typeof db, eventId, 2),
    );

    const held = await db.transaction((tx) =>
      seatRepository.pickAndLockSeats(tx as typeof db, eventId, "booking-c", 2),
    );
    await db
      .update(seats)
      .set({ status: "booked" })
      .where(eq(seats.id, held[0].id));

    const releasedCount = await db.transaction((tx) =>
      seatRepository.releaseSeats(
        tx as typeof db,
        held.map((s) => s.id),
        eventId,
      ),
    );

    expect(releasedCount).toBe(1);

    const finalSeats = await db
      .select()
      .from(seats)
      .where(eq(seats.eventId, eventId));

    expect(finalSeats.find((s) => s.id == held[0].id)!.status).toBe("booked");
    expect(finalSeats.find((s) => s.id == held[1].id)!.status).toBe(
      "available",
    );
  });
});

describe("processed_events idempotency", () => {
  it("survives being marked processed twice (redelivery)", async () => {
    const messageId = randomUUID();
    await db.transaction((tx) =>
      seatRepository.markProcessedWithTx(
        tx as typeof db,
        messageId,
        "seat.reserve_requested",
      ),
    );

    await expect(
      db.transaction((tx) =>
        seatRepository.markProcessedWithTx(
          tx as typeof db,
          messageId,
          "seat.reserve_requested",
        ),
      ),
    ).resolves.not.toThrow();

    expect(await seatRepository.isProcessed(messageId)).toBe(true);
  });
});
