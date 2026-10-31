import express, { Application } from "express";
import { logger } from "@/config/logger";
import { eventRouter } from "@/events/events.routes";
import { getPoolStats } from "@/db";
import {
  createHttpLogger,
  errorHandler,
  notFoundHandler,
  securityHeaders,
} from "@ticketing/common";
import { httpMetricsMiddleware, metricsRoute } from "./metrics";

export const createApp = (): Application => {
  const app = express();

  app.use(createHttpLogger(logger));
  app.use(securityHeaders);

  app.use(httpMetricsMiddleware);
  app.use(express.json());

  app.use("/events", eventRouter);

  app.get("/metrics", metricsRoute);

  app.get("/health", (_req, res) => {
    const pool = getPoolStats();
    const isDegraded = pool.waiting > 0 && pool.active / pool.total > 0.9;

    res.status(isDegraded ? 503 : 200).json({
      status: isDegraded ? "degraded" : "ok",
      service: "event-service",
      db: pool,
    });
  });

  app.use(notFoundHandler);

  app.use(errorHandler);

  return app;
};
