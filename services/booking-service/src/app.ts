import { Application } from "express";
import express from "express";
import logger from "./config/logger";
import { getPoolStats } from "./db";

export const createApp = (): Application => {
  const app = express();

  app.use(express.json());

  app.use((req, _res, next) => {
    logger.debug({ method: req.method, path: req.path }, "Incoming request");
    next();
  });

  app.get("/health", (_req, res) => {
    const pool = getPoolStats();
    const isDegraded = pool.waiting > 0 && pool.active / pool.total > 0.9;

    res.status(isDegraded ? 503 : 200).json({
      status: isDegraded ? "degraded" : "ok",
      service: "booking-service",
      db: pool,
    });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: "Route not found" });
  });

  return app;
};
