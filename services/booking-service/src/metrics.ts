import client from "prom-client";
import {
  createMetricsRegistry,
  createHttpMetrics,
  createMetricsRoute,
  createKafkaConsumerMetrics,
  createOutboxMetrics,
} from "@ticketing/common";

export const registry = createMetricsRegistry({
  serviceName: "booking-service",
});

export const httpMetricsMiddleware = createHttpMetrics(registry);
export const metricsRoute = createMetricsRoute(registry);
export const observeConsumedMessage = createKafkaConsumerMetrics(registry);
export const outboxMetrics = createOutboxMetrics(registry);

// The server-side view of the saga's first half. Unlike k6's own timing it has
// no 1s polling floor, so it shows the real latency at low load.
export const bookingSeatResolutionSeconds = new client.Histogram({
  name: "booking_seat_resolution_seconds",
  help: "Time from a booking being created until inventory's answer is visible to readers",
  labelNames: ["outcome"],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 20, 30, 60],
  registers: [registry],
});

for (const outcome of ["seat_held", "failed"]) {
  bookingSeatResolutionSeconds.zero({ outcome });
}

export const bookingCreatedTotal = new client.Counter({
  name: "booking_created_total",
  help: "Bookings that entered the pending state",
  registers: [registry],
});

export const bookingDuplicateTotal = new client.Counter({
  name: "booking_duplicate_idempotency_total",
  help: "Requests resolved to an existing booking via idempotency key, not a new insert",
  registers: [registry],
});

export const bookingConfirmedTotal = new client.Counter({
  name: "booking_confirmed_total",
  help: "Bookings that reached the confirmed state",
  registers: [registry],
});

export const bookingFailedTotal = new client.Counter({
  name: "booking_failed_total",
  help: "Bookings that reached the failed state",
  labelNames: ["reason"],
  registers: [registry],
});
