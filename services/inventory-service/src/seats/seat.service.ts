import {
  EventCreated,
  KafkaProducer,
  PaymentCompleted,
  SeatRelease,
  SeatReserveRequested,
  TOPICS,
} from "@ticketing/kafka-client";
import { seatRepository } from "./seat.repository";
import { logger } from "@/config/logger";
import { db } from "@/db";
import { seatsCounter } from "@/redis/seat-counter";

export const seatService = {
  seedSeats: async (msg: EventCreated): Promise<void> => {
    const { messageId, eventId, totalSeats } = msg;
    if (await seatRepository.isProcessed(messageId)) {
      logger.warn({ messageId, eventId }, "event.created already processed");
      return;
    }
    await db.transaction(async (tx) => {
      await seatRepository.seedSeatsWithTx(
        tx as typeof db,
        eventId,
        totalSeats,
      );
      await seatRepository.markProcessedWithTx(
        tx as typeof db,
        messageId,
        TOPICS.EVENT_CREATED,
      );
    });
    await seatsCounter.seed(eventId, totalSeats);
    logger.info({ eventId, totalSeats }, "Seats seeded");
  },

  assignSeats: async (
    msg: SeatReserveRequested,
    producer: KafkaProducer,
  ): Promise<void> => {
    const { messageId, bookingId, eventId, quantity } = msg;

    if (await seatRepository.isProcessed(messageId)) {
      logger.debug(
        { messageId, bookingId },
        "seat.reserve_requested already processed",
      );
      return;
    }

    let assignedSeats: Awaited<
      ReturnType<typeof seatRepository.pickAndLockSeats>
    > = [];

    await db.transaction(async (tx) => {
      assignedSeats = await seatRepository.pickAndLockSeats(
        tx as typeof db,
        eventId,
        bookingId,
        quantity,
      );
      await seatRepository.markProcessedWithTx(
        tx as typeof db,
        messageId,
        TOPICS.SEAT_RESERVE_REQUESTED,
      );
    });

    if (assignedSeats.length < quantity) {
      await producer.publish(
        TOPICS.SEAT_FAILED,
        {
          messageId: crypto.randomUUID(),
          bookingId,
          reason: quantity > 1 ? "insufficient_seats" : "no_seats_available",
        },
        bookingId,
      );
      logger.info(
        { bookingId, eventId, requested: quantity },
        "Insufficient seats — seat.failed emitted",
      );
      return;
    }

    // Decrement Redis counter by the number of seats held
    for (let i = 0; i < quantity; i++) {
      await seatsCounter.decrement(eventId);
    }

    await producer.publish(
      TOPICS.SEAT_RESERVED,
      {
        messageId: crypto.randomUUID(),
        bookingId,
        seatIds: assignedSeats.map((s) => s.id),
        seatNumbers: assignedSeats.map((s) => s.seatNumber),
        reservedAt: new Date().toISOString(),
      },
      bookingId,
    );

    logger.info(
      { bookingId, eventId, seatIds: assignedSeats.map((s) => s.id) },
      "Seats assigned",
    );
  },

  releaseSeats: async (msg: SeatRelease): Promise<void> => {
    const { messageId, bookingId, eventId, seatIds } = msg;

    if (await seatRepository.isProcessed(messageId)) {
      logger.debug({ messageId, bookingId }, "seat.release already processed");
      return;
    }

    let released = 0;

    await db.transaction(async (tx) => {
      released = await seatRepository.releaseSeats(
        tx as typeof db,
        seatIds,
        eventId,
      );
      await seatRepository.markProcessedWithTx(
        tx as typeof db,
        messageId,
        TOPICS.SEAT_RELEASE,
      );
    });

    if (released !== seatIds.length) {
      logger.warn(
        { bookingId, eventId, expected: seatIds.length, released },
        "Seat release count mismatch",
      );
    }

    // Restore the Redis counter for each released seat
    for (let i = 0; i < released; i++) {
      await seatsCounter.increment(eventId);
    }

    logger.info(
      { bookingId, eventId, released },
      "Seats released back to available",
    );
  },

  onPaymentCompleted: async (msg: PaymentCompleted): Promise<void> => {
    const { messageId, bookingId } = msg;
    if (await seatRepository.isProcessed(messageId)) return;

    let bookedCount = 0;
    await db.transaction(async (tx) => {
      bookedCount = await seatRepository.markBookedWithTx(
        tx as typeof db,
        bookingId,
      );
      await seatRepository.markProcessedWithTx(
        tx as typeof db,
        messageId,
        TOPICS.PAYMENT_COMPLETED,
      );
    });

    logger.info({ bookingId, bookedCount }, "Seats marked booked");
  },
};
