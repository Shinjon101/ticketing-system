import { createProducer, type KafkaProducer } from "@ticketing/kafka-client";
import { env } from "@/config/env";
import logger from "@/config/logger";

export const createKafkaProducer = (): KafkaProducer => {
  return createProducer({
    brokers: env.KAFKA_BROKERS.split(","),
    clientId: "event-service",
    logger,
  });
};
