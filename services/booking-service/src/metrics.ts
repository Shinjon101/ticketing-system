import client from "prom-client";
import {
  createMetricsRegistry,
  createHttpMetrics,
  createMetricsRoute,
} from "@ticketing/common";

export const registry = createMetricsRegistry({
  serviceName: "booking-service",
});

export const httpMetricsMiddleware = createHttpMetrics(registry);
export const metricsRoute = createMetricsRoute(registry);

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
