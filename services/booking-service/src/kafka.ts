import {
  createConsumer,
  createProducer,
  EventCreated,
  EventUpdated,
  KafkaProducer,
  SeatFailed,
  SeatReserved,
  TOPICS,
} from "@ticketing/kafka-client";
import { env } from "./config/env";
import logger from "./config/logger";
import { eventCache } from "./redis/event.cache";
import { bookingService } from "./booking/booking.service";

export const createKafkaProducer = (): KafkaProducer => {
  return createProducer({
    brokers: env.KAFKA_BROKERS.split(","),
    clientId: "booking-service",
    logger,
  });
};

/* Booking service consumes 4 topics:
event.created    → cache event metadata in Redis
event.updated    → invalidate event cache
seat.reserved    → confirm the booking
seat.failed      → fail the booking */

export const startKafkaConsumer = async (): Promise<() => Promise<void>> => {
  const consumer = createConsumer({
    brokers: env.KAFKA_BROKERS.split(","),
    clientId: "booking-service",
    groupId: "booking-service-group",
    logger,
  });

  await consumer.subscribe({
    [TOPICS.EVENT_CREATED]: async (msg: EventCreated) => {
      await eventCache.set(msg);
      logger.info({ eventId: msg.eventId }, "Event cached");
    },

    [TOPICS.EVENT_UPDATED]: async (msg: EventUpdated) => {
      if (msg.changes.status === "cancelled") {
        await eventCache.del(msg.eventId);
        logger.info(
          { eventId: msg.eventId },
          "Event cache invalidated (cancelled)",
        );
      } else {
        await eventCache.del(msg.eventId);
        logger.info(
          { eventId: msg.eventId },
          "Event cache invalidated (updated)",
        );
      }
    },

    [TOPICS.SEAT_RESERVED]: async (msg: SeatReserved) => {
      await bookingService.onSeatReserved(msg);
      logger.info(
        { bookingId: msg.bookingId, seatId: msg.seatId, seat: msg.seatNumber },
        "Booking confirmed",
      );
    },

    [TOPICS.SEAT_FAILED]: async (msg: SeatFailed) => {
      await bookingService.onSeatFailed(msg);
      logger.info(
        { bookingId: msg.bookingId, reason: msg.reason },
        "Booking failed",
      );
    },
  });

  return () => consumer.disconnect();
};
