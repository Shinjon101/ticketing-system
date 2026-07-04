vi.mock("@/config/logger", () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/db", () => ({
  db: { transaction: vi.fn((cb: any) => cb({})) },
}));

vi.mock("@/booking/booking.repsoitory", () => ({
  bookingRepository: {
    findById: vi.fn(),
    findByIdWithTx: vi.fn(),
    findByUserId: vi.fn(),
    findByIdempotencyKey: vi.fn(),
    createWithTx: vi.fn(),
    updateWithTx: vi.fn(),
    isProcessed: vi.fn(),
    markProcessedWithTx: vi.fn(),
  },
}));

vi.mock("@/outbox/outbox.repository", () => ({
  outboxRepository: { createWithTx: vi.fn() },
}));

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
import { bookingService } from "@/booking/booking.service";
import { bookingRepository } from "@/booking/booking.repsoitory";
import { outboxRepository } from "@/outbox/outbox.repository";
import { eventCache } from "@/redis/event.cache";
import { idempotencyCache } from "@/redis/idempotency";
import { bookingCache } from "@/redis/booking.cache";
import { db } from "@/db";
import { TOPICS } from "@ticketing/kafka-client";
import type { Booking } from "@/booking/booking.table";

const activeEvent = {
  eventId: randomUUID(),
  title: "Test Event",
  price: 5000,
  totalSeats: 100,
  eventDate: new Date(Date.now() + 86_400_000).toISOString(),
  saleStartsAt: new Date(Date.now() - 1000),
  status: "active" as const,
};

const makeBooking = (overrides: Partial<Booking> = {}): Booking => ({
  id: randomUUID(),
  userId: randomUUID(),
  eventId: activeEvent.eventId,
  quantity: 1,
  seatIds: null,
  seatNumbers: null,
  status: "pending",
  amount: 5000,
  idempotencyKey: randomUUID(),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

beforeEach(() => vi.clearAllMocks());

describe("bookingService.create", () => {
  const baseInput = {
    userId: randomUUID(),
    eventId: activeEvent.eventId,
    idempotencyKey: randomUUID(),
    quantity: 1,
  };

  it("throws 404 when the event isn't in the cache", async () => {
    vi.mocked(eventCache.get).mockResolvedValue(null);
    await expect(bookingService.create(baseInput)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("throws 400 when the event isn't active", async () => {
    vi.mocked(eventCache.get).mockResolvedValue({
      ...activeEvent,
      status: "draft",
    });
    await expect(bookingService.create(baseInput)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("throws 400 when the sale hasn't started yet", async () => {
    vi.mocked(eventCache.get).mockResolvedValue({
      ...activeEvent,
      saleStartsAt: new Date(Date.now() + 100_000),
    });
    await expect(bookingService.create(baseInput)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("returns the existing booking on an idempotency-cache hit, without inserting", async () => {
    const existing = makeBooking({ idempotencyKey: baseInput.idempotencyKey });
    vi.mocked(eventCache.get).mockResolvedValue(activeEvent);
    vi.mocked(idempotencyCache.get).mockResolvedValue(existing.id);
    vi.mocked(bookingRepository.findById).mockResolvedValue(existing);

    const result = await bookingService.create(baseInput);

    expect(result).toBe(existing);
    expect(bookingRepository.createWithTx).not.toHaveBeenCalled();
  });

  it("creates a pending booking and queues SEAT_RESERVE_REQUESTED", async () => {
    const created = makeBooking({ idempotencyKey: baseInput.idempotencyKey });
    vi.mocked(eventCache.get).mockResolvedValue(activeEvent);
    vi.mocked(idempotencyCache.get).mockResolvedValue(null);
    vi.mocked(bookingRepository.createWithTx).mockResolvedValue(created);

    await bookingService.create(baseInput);

    expect(outboxRepository.createWithTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        topic: TOPICS.SEAT_RESERVE_REQUESTED,
        payload: expect.objectContaining({
          bookingId: created.id,
          quantity: baseInput.quantity,
        }),
      }),
    );
    expect(idempotencyCache.claim).toHaveBeenCalledWith(
      baseInput.idempotencyKey,
      created.id,
    );
  });

  it("falls back to the existing booking when it loses the idempotency-key race", async () => {
    const existing = makeBooking({ idempotencyKey: baseInput.idempotencyKey });
    vi.mocked(eventCache.get).mockResolvedValue(activeEvent);
    vi.mocked(idempotencyCache.get).mockResolvedValue(null);
    vi.mocked(idempotencyCache.claim).mockResolvedValue(true);

    const uniqueViolation = Object.assign(new Error("duplicate key"), {
      code: "23505",
      constraint: "bookings_idempotency_key_unique",
    });
    vi.mocked(db.transaction).mockRejectedValueOnce(uniqueViolation);
    vi.mocked(bookingRepository.findByIdempotencyKey).mockResolvedValue(
      existing,
    );

    const result = await bookingService.create(baseInput);

    expect(result).toBe(existing);
    expect(bookingRepository.findByIdempotencyKey).toHaveBeenCalledWith(
      baseInput.idempotencyKey,
    );
  });
});

describe("bookingService: saga transitions", () => {
  const seatReservedMsg = {
    messageId: randomUUID(),
    bookingId: randomUUID(),
    seatIds: ["seat-1"],
    seatNumbers: ["Seat 1"],
    reservedAt: new Date().toISOString(),
  };

  it("onSeatReserved transitions to seat_held and queues BOOKING_SEAT_HELD", async () => {
    const booking = makeBooking({ id: seatReservedMsg.bookingId });
    vi.mocked(bookingRepository.isProcessed).mockResolvedValue(false);
    vi.mocked(bookingRepository.findByIdWithTx).mockResolvedValue(booking);
    vi.mocked(bookingRepository.updateWithTx).mockResolvedValue({
      ...booking,
      status: "seat_held",
    });

    await bookingService.onSeatReserved(seatReservedMsg);

    expect(bookingRepository.updateWithTx).toHaveBeenCalledWith(
      expect.anything(),
      seatReservedMsg.bookingId,
      expect.objectContaining({
        status: "seat_held",
        seatIds: seatReservedMsg.seatIds,
        seatNumbers: seatReservedMsg.seatNumbers,
      }),
    );
    expect(outboxRepository.createWithTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        topic: TOPICS.BOOKING_SEAT_HELD,
        payload: expect.objectContaining({
          bookingId: seatReservedMsg.bookingId,
          amount: booking.amount,
        }),
      }),
    );
    expect(bookingCache.set).toHaveBeenCalled();
  });

  it("onSeatReserved does nothing when the message was already processed", async () => {
    vi.mocked(bookingRepository.isProcessed).mockResolvedValue(true);
    await bookingService.onSeatReserved(seatReservedMsg);

    expect(bookingRepository.findByIdWithTx).not.toHaveBeenCalled();
    expect(outboxRepository.createWithTx).not.toHaveBeenCalled();
  });

  it("onSeatFailed transitions the booking to failed", async () => {
    const bookingId = randomUUID();
    vi.mocked(bookingRepository.isProcessed).mockResolvedValue(false);
    vi.mocked(bookingRepository.updateWithTx).mockResolvedValue(
      makeBooking({ id: bookingId, status: "failed" }),
    );

    await bookingService.onSeatFailed({
      messageId: randomUUID(),
      bookingId,
      reason: "no_seats_available",
    });

    expect(bookingRepository.updateWithTx).toHaveBeenCalledWith(
      expect.anything(),
      bookingId,
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("onPaymentCompleted transitions the booking to confirmed", async () => {
    const bookingId = randomUUID();
    vi.mocked(bookingRepository.isProcessed).mockResolvedValue(false);
    vi.mocked(bookingRepository.updateWithTx).mockResolvedValue(
      makeBooking({ id: bookingId, status: "confirmed" }),
    );

    await bookingService.onPaymentCompleted({
      messageId: randomUUID(),
      bookingId,
      razorpayPaymentId: "pay_x",
      razorpayOrderId: "order_x",
      amount: 5000,
      paidAt: new Date().toISOString(),
    });

    expect(bookingRepository.updateWithTx).toHaveBeenCalledWith(
      expect.anything(),
      bookingId,
      expect.objectContaining({ status: "confirmed" }),
    );
  });
});

describe("bookingService.onPaymentFailed: compensation branch", () => {
  it("queues SEAT_RELEASE when the booking holds seats", async () => {
    const booking = makeBooking({
      status: "seat_held",
      seatIds: ["seat-1", "seat-2"],
    });
    vi.mocked(bookingRepository.isProcessed).mockResolvedValue(false);
    vi.mocked(bookingRepository.findByIdWithTx).mockResolvedValue(booking);
    vi.mocked(bookingRepository.updateWithTx).mockResolvedValue({
      ...booking,
      status: "failed",
    });

    await bookingService.onPaymentFailed({
      messageId: randomUUID(),
      bookingId: booking.id,
      reason: "payment_declined",
      failedAt: new Date().toISOString(),
    });

    expect(outboxRepository.createWithTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        topic: TOPICS.SEAT_RELEASE,
        payload: expect.objectContaining({ seatIds: booking.seatIds }),
      }),
    );
  });

  it("does NOT queue SEAT_RELEASE when the booking never held seats", async () => {
    const booking = makeBooking({ status: "pending", seatIds: null });
    vi.mocked(bookingRepository.isProcessed).mockResolvedValue(false);
    vi.mocked(bookingRepository.findByIdWithTx).mockResolvedValue(booking);
    vi.mocked(bookingRepository.updateWithTx).mockResolvedValue({
      ...booking,
      status: "failed",
    });

    await bookingService.onPaymentFailed({
      messageId: randomUUID(),
      bookingId: booking.id,
      reason: "hold_expired",
      failedAt: new Date().toISOString(),
    });

    expect(outboxRepository.createWithTx).not.toHaveBeenCalled();
  });
});

describe("bookingService.getById — access control", () => {
  it("throws 403 when the booking belongs to a different user", async () => {
    const booking = makeBooking({ userId: "someone-else" });
    vi.mocked(bookingCache.get).mockResolvedValue(null);
    vi.mocked(bookingRepository.findById).mockResolvedValue(booking);

    await expect(
      bookingService.getById(booking.id, "me"),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("throws 404 when the booking doesn't exist", async () => {
    vi.mocked(bookingCache.get).mockResolvedValue(null);
    vi.mocked(bookingRepository.findById).mockResolvedValue(undefined);

    await expect(
      bookingService.getById("missing-id", "me"),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
