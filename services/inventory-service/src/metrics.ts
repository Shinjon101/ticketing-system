import {
  createMetricsRegistry,
  createHttpMetrics,
  createMetricsRoute,
  createKafkaConsumerMetrics,
  createOutboxMetrics,
} from "@ticketing/common";
import { RequestHandler } from "express";

export const registry = createMetricsRegistry({
  serviceName: "inventory-service",
});

export const httpMetricsMiddleware: RequestHandler =
  createHttpMetrics(registry);
export const metricsRoute: RequestHandler = createMetricsRoute(registry);
export const observeConsumedMessage = createKafkaConsumerMetrics(registry);
export const outboxMetrics = createOutboxMetrics(registry);
