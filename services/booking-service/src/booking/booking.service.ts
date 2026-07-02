import { HttpError } from "@ticketing/common";
import { bookingRepository } from "./booking.repsoitory";
import { Booking } from "./booking.table";
import { eventCache } from "@/redis/event.cache";
import { idempotencyCache } from "@/redis/idempotency";
import { db } from "@/db";
import { outboxRepository } from "@/outbox/outbox.repository";
import {
  PaymentCompleted,
  PaymentFailed,
  SeatFailed,
  SeatReserved,
  TOPICS,
} from "@ticketing/kafka-client";
import { bookingCache } from "@/redis/booking.cache";
import logger from "@/config/logger";

export interface CreateBookingInput {
  userId: string;
  eventId: string;
  idempotencyKey: string;
  quantity: number;
}

const HOLD_DURATION_MS = 30 * 60 * 1000; // 30 min

export const bookingService = {
  getById: async (id: string, userId: string): Promise<Booking> => {
    let booking = await bookingCache.get(id);

    if (!booking) {
      booking = (await bookingRepository.findById(id)) as Booking;
      if (!booking) throw new HttpError(404, "Booking not found");

      await bookingCache.set(booking);
    }

    if (booking.userId !== userId) {
      throw new HttpError(403, "Forbidden");
    }

    return booking;
  },

  getByUserId: async (userId: string): Promise<Booking[]> => {
    return bookingRepository.findByUserId(userId);
  },

  create: async (input: CreateBookingInput): Promise<Booking> => {
    const { eventId, idempotencyKey, userId, quantity } = input;

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
        quantity,
        status: "pending",
        amount: event.price * quantity,
        idempotencyKey,
      });

      await outboxRepository.createWithTx(tx as typeof db, {
        topic: TOPICS.SEAT_RESERVE_REQUESTED,
        payload: {
          messageId: crypto.randomUUID(),
          bookingId: booking.id,
          userId,
          eventId,
          quantity,
          requestedAt: new Date().toISOString(),
        },
      });
    });
    await idempotencyCache.claim(idempotencyKey, booking.id);

    return booking;
  },

  onSeatReserved: async (msg: SeatReserved): Promise<void> => {
    const { messageId, bookingId, seatIds, seatNumbers } = msg;
    if (await bookingRepository.isProcessed(messageId)) return;

    const expiresAt = new Date(Date.now() + HOLD_DURATION_MS).toISOString();

    const updatedBooking = await db.transaction(async (tx) => {
      const booking = await bookingRepository.findByIdWithTx(
        tx as typeof db,
        bookingId,
      );
      if (!booking) return undefined;

      const updated = await bookingRepository.updateWithTx(
        tx as typeof db,
        bookingId,
        {
          status: "seat_held",
          seatIds,
          seatNumbers,
        },
      );

      await outboxRepository.createWithTx(tx as typeof db, {
        topic: TOPICS.BOOKING_SEAT_HELD,
        payload: {
          messageId: crypto.randomUUID(),
          bookingId,
          userId: booking.userId,
          eventId: booking.eventId,
          seatIds,
          seatNumbers,
          amount: booking.amount,
          expiresAt,
        },
      });

      await bookingRepository.markProcessedWithTx(
        tx as typeof db,
        messageId,
        TOPICS.SEAT_RESERVED,
      );
      return updated;
    });

    if (updatedBooking) await bookingCache.set(updatedBooking);
  },
  onSeatFailed: async (msg: SeatFailed): Promise<void> => {
    const { messageId, bookingId } = msg;

    if (await bookingRepository.isProcessed(messageId)) return;

    const updatedBooking = await db.transaction(async (tx) => {
      const updated = await bookingRepository.updateWithTx(
        tx as typeof db,
        bookingId,
        {
          status: "failed",
        },
      );

      await bookingRepository.markProcessedWithTx(
        tx as typeof db,
        messageId,
        TOPICS.SEAT_FAILED,
      );
      return updated;
    });

    if (updatedBooking) await bookingCache.set(updatedBooking);
  },

  onPaymentCompleted: async (msg: PaymentCompleted): Promise<void> => {
    const { messageId, bookingId } = msg;
    if (await bookingRepository.isProcessed(messageId)) return;

    const updatedBooking = await db.transaction(async (tx) => {
      const updated = await bookingRepository.updateWithTx(
        tx as typeof db,
        bookingId,
        {
          status: "confirmed",
        },
      );
      await bookingRepository.markProcessedWithTx(
        tx as typeof db,
        messageId,
        TOPICS.PAYMENT_COMPLETED,
      );
      return updated;
    });

    if (updatedBooking) await bookingCache.set(updatedBooking);
  },

  onPaymentFailed: async (msg: PaymentFailed): Promise<void> => {
    const { messageId, bookingId } = msg;
    if (await bookingRepository.isProcessed(messageId)) return;

    const updatedBooking = await db.transaction(async (tx) => {
      const booking = await bookingRepository.findByIdWithTx(
        tx as typeof db,
        bookingId,
      );
      if (!booking) return undefined;

      const updated = await bookingRepository.updateWithTx(
        tx as typeof db,
        bookingId,
        {
          status: "failed",
        },
      );

      if (booking.seatIds && booking.seatIds.length > 0) {
        await outboxRepository.createWithTx(tx as typeof db, {
          topic: TOPICS.SEAT_RELEASE,
          payload: {
            messageId: crypto.randomUUID(),
            bookingId,
            eventId: booking.eventId,
            seatIds: booking.seatIds,
          },
        });
      } else {
        logger.warn(
          { bookingId },
          "payment.failed received but booking has no held seats to release",
        );
      }

      await bookingRepository.markProcessedWithTx(
        tx as typeof db,
        messageId,
        TOPICS.PAYMENT_FAILED,
      );
      return updated;
    });

    if (updatedBooking) await bookingCache.set(updatedBooking);
  },
};
