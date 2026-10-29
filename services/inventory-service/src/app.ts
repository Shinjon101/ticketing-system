import type { Application } from "express";
import express from "express";
import { createErrorHandler, notFoundHandler } from "@ticketing/common";
import { logger } from "./config/logger";
import { getPoolStats } from "./db";
import { seatsCounter } from "./redis/seat-counter";
import { seatRepository } from "./seats/seat.repository";
import { httpMetricsMiddleware, metricsRoute } from "./metrics";

export const createApp = (): Application => {
  const app: Application = express();
  app.use(httpMetricsMiddleware);
  app.use(express.json());

  app.get("/health", (_req, res) => {
    const pool = getPoolStats();
    const isDegraded = pool.waiting > 0 && pool.active / pool.total > 0.9;

    res.status(isDegraded ? 503 : 200).json({
      status: isDegraded ? "degraded" : "ok",
      service: "inventory-service",
      db: pool,
    });
  });

  app.get("/metrics", metricsRoute);

  app.get("/inventory/seats/:eventId/available", async (req, res) => {
    const eventId = String(req.params.eventId);

    const cached = await seatsCounter.get(eventId);
    if (cached !== null) {
      res.status(200).json({ eventId, available: cached, source: "cache" });
      return;
    }

    const count = await seatRepository.countAvailable(eventId);

    await seatsCounter.seed(eventId, count);

    res.status(200).json({ eventId, available: count, source: "db" });
  });

  app.use(notFoundHandler);

  app.use(createErrorHandler(logger));

  return app;
};
