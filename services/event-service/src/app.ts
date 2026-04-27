import express, { Application } from "express";
import logger from "@/config/logger";
import { eventRouter } from "@/events/events.routes";
import { getPoolStats } from "@/db";
import { errorHandler } from "@/middleware/error-handler";

export const createApp = (): Application => {
  const app = express();

  app.use(express.json());

  app.use((req, _res, next) => {
    logger.debug({ method: req.method, path: req.path }, "Incoming request");
    next();
  });

  app.use("/events", eventRouter);

  app.get("/health", (_req, res) => {
    const pool = getPoolStats();
    const isDegraded = pool.waiting > 0 && pool.active / pool.total > 0.9;

    res.status(isDegraded ? 503 : 200).json({
      status: isDegraded ? "degraded" : "ok",
      service: "event-service",
      db: pool,
    });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: "Route not found" });
  });

  app.use(errorHandler);

  return app;
};
