import {
  createConsumer,
  createProducer,
  EventCreated,
  EventUpdated,
  KafkaProducer,
  SeatFailed,
  SeatReserved,
  PaymentCompleted,
  PaymentFailed,
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
      } else {
        const cachedEvent = await eventCache.get(msg.eventId);
        if (cachedEvent) {
          await eventCache.set({
            ...cachedEvent,
            messageId: msg.messageId,
            title: msg.changes.title ?? cachedEvent.title,
            price: msg.changes.price ?? cachedEvent.price,
            totalSeats: msg.changes.totalSeats ?? cachedEvent.totalSeats,
            status: (msg.changes.status ?? cachedEvent.status) as
              | "active"
              | "draft",
          });
        }
      }
    },

    [TOPICS.SEAT_RESERVED]: async (msg: SeatReserved) => {
      await bookingService.onSeatReserved(msg);
    },

    [TOPICS.SEAT_FAILED]: async (msg: SeatFailed) => {
      await bookingService.onSeatFailed(msg);
    },

    [TOPICS.PAYMENT_COMPLETED]: async (msg: PaymentCompleted) => {
      await bookingService.onPaymentCompleted(msg);
      logger.info(
        { bookingId: msg.bookingId },
        "Booking confirmed via payment",
      );
    },

    [TOPICS.PAYMENT_FAILED]: async (msg: PaymentFailed) => {
      await bookingService.onPaymentFailed(msg);
      logger.info(
        { bookingId: msg.bookingId, reason: msg.reason },
        "Booking failed, seat release queued",
      );
    },
  });

  return () => consumer.disconnect();
};
