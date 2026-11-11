import client from "prom-client";
import { QUEUE_WAIT_BUCKETS, WORK_DURATION_BUCKETS } from "./buckets";

// "full" means the poller fetched a whole batch, so more rows were probably
// waiting behind it. A rising share of full cycles is the poller saturating.
export type OutboxCycleResult = "empty" | "partial" | "full" | "error";

const CYCLE_RESULTS: OutboxCycleResult[] = [
  "empty",
  "partial",
  "full",
  "error",
];

export interface OutboxMetrics {
  startCycle: () => (result: OutboxCycleResult) => void;
  observePublished: (
    topic: string,
    createdAt: Date,
    publishedAt: number,
  ) => void;
}

export const createOutboxMetrics = (
  register: client.Registry,
): OutboxMetrics => {
  const publishDelay = new client.Histogram({
    name: "outbox_publish_delay_seconds",
    help: "Time an outbox row waited between being written and being published to Kafka",
    labelNames: ["topic"],
    buckets: QUEUE_WAIT_BUCKETS,
    registers: [register],
  });

  // _count by result doubles as the cycle counter, so no separate counter.
  const cycleDuration = new client.Histogram({
    name: "outbox_poll_duration_seconds",
    help: "Duration of one outbox poll cycle: fetch, publish and mark published",
    labelNames: ["result"],
    buckets: WORK_DURATION_BUCKETS,
    registers: [register],
  });

  // Export every result at 0 from startup so a rate over "full" or "error"
  // reads as 0 rather than "no data" before the first such cycle.
  for (const result of CYCLE_RESULTS) cycleDuration.zero({ result });

  return {
    startCycle: () => {
      const end = cycleDuration.startTimer();
      return (result) => {
        end({ result });
      };
    },

    observePublished: (topic, createdAt, publishedAt) => {
      const seconds = (publishedAt - createdAt.getTime()) / 1000;
      // Clamp the small negatives that clock skew between the DB and the
      // service can produce.
      publishDelay.observe({ topic }, Math.max(0, seconds));
    },
  };
};
