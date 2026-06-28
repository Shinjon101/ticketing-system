import express, { type Application } from "express";
import { errorHandler } from "./middlewares/error-handler";
import { getPoolStats } from "./db";

export const createApp = (): Application => {
  const app = express();

  app.use(express.json());

  app.get("/health", (_req, res) => {
    const pool = getPoolStats();
    const isDegraded = pool.waiting > 0 && pool.active / pool.total > 0.9;
    res.status(isDegraded ? 503 : 200).json({
      status: isDegraded ? "degraded" : "ok",
      service: "payment-service",
      db: pool,
    });
  });

  app.use((_req, res) => res.status(404).json({ error: "Route not found" }));
  app.use(errorHandler);
  return app;
};
