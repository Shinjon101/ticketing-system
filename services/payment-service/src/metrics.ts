import {
  createMetricsRegistry,
  createHttpMetrics,
  createMetricsRoute,
} from "@ticketing/common";
import { RequestHandler } from "express";

export const registry = createMetricsRegistry({
  serviceName: "payment-service",
});

export const httpMetricsMiddleware: RequestHandler =
  createHttpMetrics(registry);
export const metricsRoute: RequestHandler = createMetricsRoute(registry);
