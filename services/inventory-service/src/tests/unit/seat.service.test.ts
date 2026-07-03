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

vi.mock("@/db", () => ({
  db: { transaction: vi.fn((cb: any) => cb({})) },
}));

vi.mock("@/seats/seat.repository", () => ({
  seatRepository: {
    isProcessed: vi.fn(),
    markProcessedWithTx: vi.fn(),
    pickAndLockSeats: vi.fn(),
  },
}));

import { randomUUID } from "crypto";
import { seatService } from "@/seats/seat.service";
import { seatRepository } from "@/seats/seat.repository";
import { TOPICS } from "@ticketing/kafka-client";

const createMockProducer = () => ({
  publish: vi.fn().mockResolvedValue(undefined),
  connect: vi.fn(),
  disconnect: vi.fn(),
});

describe("seatService.assignSeats — orchestration logic", () => {
  beforeEach(() => vi.clearAllMocks());

  const baseMsg = {
    messageId: randomUUID(),
    bookingId: randomUUID(),
    userId: randomUUID(),
    eventId: randomUUID(),
    requestedAt: new Date().toISOString(),
  };

  it("publishes SEAT_RESERVED with the assigned seats on success", async () => {
    vi.mocked(seatRepository.isProcessed).mockResolvedValue(false);
    vi.mocked(seatRepository.pickAndLockSeats).mockResolvedValue([
      { id: "seat-1", seatNumber: "Seat 1" } as any,
    ]);

    const producer = createMockProducer();
    await seatService.assignSeats({ ...baseMsg, quantity: 1 }, producer);

    expect(producer.publish).toHaveBeenCalledWith(
      TOPICS.SEAT_RESERVED,
      expect.objectContaining({
        bookingId: baseMsg.bookingId,
        seatIds: ["seat-1"],
        seatNumbers: ["Seat 1"],
      }),
      baseMsg.bookingId,
    );
  });

  it("reports 'no_seats_available' when a single-seat request fails", async () => {
    vi.mocked(seatRepository.isProcessed).mockResolvedValue(false);
    vi.mocked(seatRepository.pickAndLockSeats).mockResolvedValue([]);

    const producer = createMockProducer();
    await seatService.assignSeats({ ...baseMsg, quantity: 1 }, producer);

    expect(producer.publish).toHaveBeenCalledWith(
      TOPICS.SEAT_FAILED,
      expect.objectContaining({ reason: "no_seats_available" }),
      baseMsg.bookingId,
    );
  });

  it("reports 'insufficient_seats' when a multi-seat request can't be fully satisfied", async () => {
    vi.mocked(seatRepository.isProcessed).mockResolvedValue(false);
    vi.mocked(seatRepository.pickAndLockSeats).mockResolvedValue([]);

    const producer = createMockProducer();
    await seatService.assignSeats({ ...baseMsg, quantity: 4 }, producer);

    expect(producer.publish).toHaveBeenCalledWith(
      TOPICS.SEAT_FAILED,
      expect.objectContaining({ reason: "insufficient_seats" }),
      baseMsg.bookingId,
    );
  });

  it("does nothing when the message was already processed", async () => {
    vi.mocked(seatRepository.isProcessed).mockResolvedValue(true);

    const producer = createMockProducer();
    await seatService.assignSeats({ ...baseMsg, quantity: 1 }, producer);

    expect(seatRepository.pickAndLockSeats).not.toHaveBeenCalled();
    expect(producer.publish).not.toHaveBeenCalled();
  });
});
