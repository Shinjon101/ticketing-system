import {
  createConsumer,
  createProducer,
  EventCreated,
  KafkaProducer,
  SeatReserveRequested,
  TOPICS,
} from "@ticketing/kafka-client";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { seatService } from "./seats/seat.service";

export const createKafkaProducer = (): KafkaProducer => {
  return createProducer({
    brokers: env.KAFKA_BROKERS.split(","),
    clientId: "inventory-service",
    logger,
  });
};

export const startKafkaConsumer = async (
  producer: KafkaProducer,
): Promise<() => Promise<void>> => {
  const consumer = createConsumer({
    brokers: env.KAFKA_BROKERS.split(","),
    clientId: "inventory-service",
    groupId: "inventory-service-group",
    logger,
  });

  await consumer.subscribe({
    [TOPICS.EVENT_CREATED]: async (msg: EventCreated) => {
      await seatService.seedSeats(msg);
    },

    [TOPICS.SEAT_RESERVE_REQUESTED]: async (msg: SeatReserveRequested) => {
      await seatService.assignSeat(msg, producer);
    },
  });

  return () => consumer.disconnect();
};
