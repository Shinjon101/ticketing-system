vi.mock("@/config/logger", () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/redis/seat-counter", () => ({
  seatsCounter: {
    decrement: vi.fn(),
    increment: vi.fn(),
    seed: vi.fn(),
    get: vi.fn(),
  },
}));

vi.mock("@/redis/index", () => ({
  redis: {
    set: vi.fn(),
    setnx: vi.fn(),
    get: vi.fn(),
    decr: vi.fn(),
    incr: vi.fn(),
  },
}));

const { fakeTx } = vi.hoisted(() => ({ fakeTx: {} }));

vi.mock("@/db", () => ({
  db: { transaction: vi.fn((cb: any) => cb(fakeTx)) },
}));

vi.mock("@/seats/seat.repository", () => ({
  seatRepository: {
    isProcessed: vi.fn(),
    markProcessedWithTx: vi.fn(),
    pickAndLockSeats: vi.fn(),
  },
}));

vi.mock("@/outbox/outbox.repository", () => ({
  outboxRepository: {
    createWithTx: vi.fn(),
  },
}));

import { randomUUID } from "crypto";
import { seatService } from "@/seats/seat.service";
import { seatRepository } from "@/seats/seat.repository";
import { outboxRepository } from "@/outbox/outbox.repository";
import { seatsCounter } from "@/redis/seat-counter";
import { TOPICS } from "@ticketing/kafka-client";

describe("seatService.assignSeats — orchestration logic", () => {
  beforeEach(() => vi.clearAllMocks());

  const baseMsg = {
    messageId: randomUUID(),
    bookingId: randomUUID(),
    userId: randomUUID(),
    eventId: randomUUID(),
    requestedAt: new Date().toISOString(),
  };

  it("writes SEAT_RESERVED to the outbox with the assigned seats on success", async () => {
    vi.mocked(seatRepository.isProcessed).mockResolvedValue(false);
    vi.mocked(seatRepository.pickAndLockSeats).mockResolvedValue([
      { id: "seat-1", seatNumber: "Seat 1" } as any,
    ]);

    await seatService.assignSeats({ ...baseMsg, quantity: 1 });

    expect(outboxRepository.createWithTx).toHaveBeenCalledWith(fakeTx, {
      topic: TOPICS.SEAT_RESERVED,
      payload: expect.objectContaining({
        bookingId: baseMsg.bookingId,
        seatIds: ["seat-1"],
        seatNumbers: ["Seat 1"],
      }),
    });
    expect(seatsCounter.decrement).toHaveBeenCalledTimes(1);
  });

  it("writes the outbox row in the same transaction as the seat hold", async () => {
    vi.mocked(seatRepository.isProcessed).mockResolvedValue(false);
    vi.mocked(seatRepository.pickAndLockSeats).mockResolvedValue([
      { id: "seat-1", seatNumber: "Seat 1" } as any,
    ]);

    await seatService.assignSeats({ ...baseMsg, quantity: 1 });

    const [pickTx] = vi.mocked(seatRepository.pickAndLockSeats).mock.calls[0]!;
    const [processedTx] = vi.mocked(seatRepository.markProcessedWithTx).mock
      .calls[0]!;
    const [outboxTx] = vi.mocked(outboxRepository.createWithTx).mock.calls[0]!;

    expect(pickTx).toBe(fakeTx);
    expect(processedTx).toBe(fakeTx);
    expect(outboxTx).toBe(fakeTx);
  });

  it("reports 'no_seats_available' when a single-seat request fails", async () => {
    vi.mocked(seatRepository.isProcessed).mockResolvedValue(false);
    vi.mocked(seatRepository.pickAndLockSeats).mockResolvedValue([]);

    await seatService.assignSeats({ ...baseMsg, quantity: 1 });

    expect(outboxRepository.createWithTx).toHaveBeenCalledWith(fakeTx, {
      topic: TOPICS.SEAT_FAILED,
      payload: expect.objectContaining({
        bookingId: baseMsg.bookingId,
        reason: "no_seats_available",
      }),
    });
  });

  it("reports 'insufficient_seats' when a multi-seat request can't be fully satisfied", async () => {
    vi.mocked(seatRepository.isProcessed).mockResolvedValue(false);
    vi.mocked(seatRepository.pickAndLockSeats).mockResolvedValue([]);

    await seatService.assignSeats({ ...baseMsg, quantity: 4 });

    expect(outboxRepository.createWithTx).toHaveBeenCalledWith(fakeTx, {
      topic: TOPICS.SEAT_FAILED,
      payload: expect.objectContaining({ reason: "insufficient_seats" }),
    });
  });

  it("does not decrement the seat counter when the request fails", async () => {
    vi.mocked(seatRepository.isProcessed).mockResolvedValue(false);
    vi.mocked(seatRepository.pickAndLockSeats).mockResolvedValue([]);

    await seatService.assignSeats({ ...baseMsg, quantity: 4 });

    expect(seatsCounter.decrement).not.toHaveBeenCalled();
  });

  it("propagates an outbox write failure so the message is redelivered", async () => {
    vi.mocked(seatRepository.isProcessed).mockResolvedValue(false);
    vi.mocked(seatRepository.pickAndLockSeats).mockResolvedValue([
      { id: "seat-1", seatNumber: "Seat 1" } as any,
    ]);
    vi.mocked(outboxRepository.createWithTx).mockRejectedValueOnce(
      new Error("db down"),
    );

    await expect(
      seatService.assignSeats({ ...baseMsg, quantity: 1 }),
    ).rejects.toThrow("db down");
    expect(seatsCounter.decrement).not.toHaveBeenCalled();
  });

  it("does nothing when the message was already processed", async () => {
    vi.mocked(seatRepository.isProcessed).mockResolvedValue(true);

    await seatService.assignSeats({ ...baseMsg, quantity: 1 });

    expect(seatRepository.pickAndLockSeats).not.toHaveBeenCalled();
    expect(outboxRepository.createWithTx).not.toHaveBeenCalled();
  });
});
