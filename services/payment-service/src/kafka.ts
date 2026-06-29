import {
  createConsumer,
  createProducer,
  BookingSeatHeld,
  KafkaProducer,
  TOPICS,
} from "@ticketing/kafka-client";
import { env } from "@/config/env";
import { logger } from "@/config/logger";
import { paymentService } from "@/payment/payment.service";

export const createKafkaProducer = (): KafkaProducer =>
  createProducer({
    brokers: env.KAFKA_BROKERS.split(","),
    clientId: "payment-service",
    logger,
  });

export const startKafkaConsumer = async (): Promise<() => Promise<void>> => {
  const consumer = createConsumer({
    brokers: env.KAFKA_BROKERS.split(","),
    clientId: "payment-service",
    groupId: "payment-service-group",
    logger,
  });

  await consumer.subscribe({
    [TOPICS.BOOKING_SEAT_HELD]: async (msg: BookingSeatHeld) => {
      await paymentService.onSeatHeld(msg);
    },
  });

  return () => consumer.disconnect();
};
