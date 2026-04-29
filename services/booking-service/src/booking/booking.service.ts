import { HttpError } from "@ticketing/common";
import { bookingRepository } from "./booking.repsoitory";
import { Booking } from "./booking.table";
import { eventCache } from "@/redis/event-cache";
import { idempotencyCache } from "@/redis/idempotency";
import { db } from "@/db";
import { outboxRepository } from "@/outbox/outbox.repository";
import { SeatFailed, SeatReserved, TOPICS } from "@ticketing/kafka-client";

export interface CreateBookingInput {
  userId: string;
  eventId: string;
  idempotencyKey: string;
}

export const bookingService = {
  getById: async (id: string, userId: string): Promise<Booking> => {
    const booking = await bookingRepository.findById(id);
    if (!booking) throw new HttpError(404, "Booking not found");

    if (booking.userId !== userId) throw new HttpError(403, "Forbidden");

    return booking;
  },

  getByUserId: async (userId: string): Promise<Booking[]> => {
    return bookingRepository.findByUserId(userId);
  },

  create: async (input: CreateBookingInput): Promise<Booking> => {
    const { eventId, idempotencyKey, userId } = input;

    const event = await eventCache.get(eventId);

    if (!event) {
      throw new HttpError(404, "Event not found or not yet available");
    }

    if (event.status !== "active") {
      throw new HttpError(
        400,
        `Event is ${event.status} — bookings not accepted`,
      );
    }

    if (event.saleStartsAt && new Date() < new Date(event.saleStartsAt)) {
      throw new HttpError(400, "Sale has not started yet");
    }

    //idempotency check
    const existingBookingId = await idempotencyCache.get(idempotencyKey);
    if (existingBookingId) {
      const existing = await bookingRepository.findById(existingBookingId);
      if (existing) return existing;
    }

    let booking!: Booking;

    await db.transaction(async (tx) => {
      booking = await bookingRepository.createWithTx(tx as typeof db, {
        userId,
        eventId,
        status: "pending",
        amount: event.price,
        idempotencyKey,
      });

      await outboxRepository.createWithTx(tx as typeof db, {
        topic: TOPICS.SEAT_RESERVE_REQUESTED,
        payload: {
          messageId: crypto.randomUUID(),
          bookingId: booking.id,
          userId,
          eventId,
          requestedAt: new Date().toISOString(),
        },
      });
    });
    await idempotencyCache.claim(idempotencyKey, booking.id);

    return booking;
  },

  // Called by Kafka after inventory service consumption

  onSeatReserved: async (msg: SeatReserved): Promise<void> => {
    const { messageId, bookingId, seatId, seatNumber } = msg;

    if (await bookingRepository.isProcessed(messageId)) return;

    await db.transaction(async (tx) => {
      await bookingRepository.updateWithTx(tx as typeof db, bookingId, {
        status: "confirmed",
        seatId,
        seatNumber,
      });

      await bookingRepository.markProcessedWithTx(
        tx as typeof db,
        messageId,
        TOPICS.SEAT_RESERVED,
      );
    });
  },

  onSeatFailed: async (msg: SeatFailed): Promise<void> => {
    const { messageId, bookingId } = msg;

    if (await bookingRepository.isProcessed(messageId)) return;

    await db.transaction(async (tx) => {
      await bookingRepository.updateWithTx(tx as typeof db, bookingId, {
        status: "failed",
      });

      await bookingRepository.markProcessedWithTx(
        tx as typeof db,
        messageId,
        TOPICS.SEAT_FAILED,
      );
    });
  },
};
