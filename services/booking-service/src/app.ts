import { Application } from "express";
import express from "express";
import { logger } from "./config/logger";
import { getPoolStats } from "./db";
import { bookingRouter } from "./booking/booking.routes";
import { httpMetricsMiddleware, metricsRoute } from "./metrics";
import {
  createHttpLogger,
  errorHandler,
  notFoundHandler,
  securityHeaders,
} from "@ticketing/common";

export const createApp = (): Application => {
  const app = express();

  app.use(createHttpLogger(logger));
  app.use(securityHeaders);

  app.use(express.json());
  app.use(httpMetricsMiddleware);

  app.use("/bookings", bookingRouter);

  app.get("/health", (_req, res) => {
    const pool = getPoolStats();
    const isDegraded = pool.waiting > 0 && pool.active / pool.total > 0.9;

    res.status(isDegraded ? 503 : 200).json({
      status: isDegraded ? "degraded" : "ok",
      service: "booking-service",
      db: pool,
    });
  });

  app.get("/metrics", metricsRoute);

  app.use(notFoundHandler);

  app.use(errorHandler);

  return app;
};
