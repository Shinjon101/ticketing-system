import {
  EventCreated,
  KafkaProducer,
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

  assignSeat: async (
    msg: SeatReserveRequested,
    producer: KafkaProducer,
  ): Promise<void> => {
    const { messageId, bookingId, eventId } = msg;

    if (await seatRepository.isProcessed(messageId)) {
      logger.debug(
        { messageId, bookingId },
        "seat.reserve_requested already processed — skipping",
      );
      return;
    }

    let assignedSeat: Awaited<
      ReturnType<typeof seatRepository.pickAndLockSeat>
    >;

    await db.transaction(async (tx) => {
      assignedSeat = await seatRepository.pickAndLockSeat(
        tx as typeof db,
        eventId,
        bookingId,
      );

      await seatRepository.markProcessedWithTx(
        tx as typeof db,
        messageId,
        TOPICS.SEAT_RESERVE_REQUESTED,
      );
    });

    if (!assignedSeat) {
      await producer.publish(
        TOPICS.SEAT_FAILED,
        {
          messageId: crypto.randomUUID,
          bookingId,
          reason: "no_seats_available",
        },
        bookingId,
      );

      logger.info(
        { bookingId, eventId },
        "No seats available — seat.failed emitted",
      );
      return;
    }

    await seatsCounter.decrement(eventId);

    await producer.publish(
      TOPICS.SEAT_RESERVED,
      {
        messageId: crypto.randomUUID(),
        bookingId,
        seatId: assignedSeat.id,
        seatNumber: assignedSeat.seatNumber,
        reservedAt: new Date().toISOString(),
      },
      bookingId,
    );

    logger.info(
      {
        bookingId,
        eventId,
        seatId: assignedSeat.id,
        seat: assignedSeat.seatNumber,
      },
      "Seat assigned — seat.reserved emitted",
    );
  },
};
