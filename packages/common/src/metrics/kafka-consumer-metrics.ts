import client from "prom-client";
import { QUEUE_WAIT_BUCKETS, WORK_DURATION_BUCKETS } from "./buckets";

// Same shape as ConsumedMessageObservation in @ticketing/kafka-client. Declared
// here structurally so common doesn't take a dependency on the Kafka package.
export interface ConsumedMessageObservation {
  topic: string;
  waitSeconds: number | null;
  processingSeconds: number;
  attempts: number;
  outcome: "processed" | "dlq" | "skipped" | "error";
}

export const createKafkaConsumerMetrics = (
  register: client.Registry,
): ((observation: ConsumedMessageObservation) => void) => {
  const wait = new client.Histogram({
    name: "kafka_consumer_message_wait_seconds",
    help: "Time from a message being produced to this consumer starting work on it",
    labelNames: ["topic"],
    buckets: QUEUE_WAIT_BUCKETS,
    registers: [register],
  });

  const processing = new client.Histogram({
    name: "kafka_consumer_processing_seconds",
    help: "Time spent validating and handling a message, including retry backoff",
    labelNames: ["topic", "outcome"],
    buckets: WORK_DURATION_BUCKETS,
    registers: [register],
  });

  const retries = new client.Counter({
    name: "kafka_consumer_handler_retries_total",
    help: "Handler attempts beyond the first",
    labelNames: ["topic"],
    registers: [register],
  });

  return (observation) => {
    const { topic, waitSeconds, processingSeconds, attempts, outcome } =
      observation;

    if (waitSeconds !== null) wait.observe({ topic }, waitSeconds);
    processing.observe({ topic, outcome }, processingSeconds);
    if (attempts > 1) retries.inc({ topic }, attempts - 1);
  };
};
