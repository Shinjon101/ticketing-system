import { Application } from "express";
import express from "express";
import cookieParser from "cookie-parser";
import { logger } from "@/config/logger";
import { authRouter } from "@/auth/auth.routes";
import { userRouter } from "@/users/user.routes";
import { getPoolStats } from "@/db";
import {
  createHttpLogger,
  errorHandler,
  notFoundHandler,
} from "@ticketing/common";
import { httpMetricsMiddleware, metricsRoute } from "./metrics";

export const createApp = (): Application => {
  const app = express();

  app.use(createHttpLogger(logger));

  app.use(httpMetricsMiddleware);
  app.use(express.json());

  app.use(cookieParser());

  app.use("/auth", authRouter);
  app.use("/auth", userRouter);

  app.get("/health", (_req, res) => {
    const pool = getPoolStats();
    const isDegraded = pool.waiting > 0 && pool.active / pool.total > 0.9;

    res.status(isDegraded ? 503 : 200).json({
      status: isDegraded ? "degratee" : "ok",
      service: "auth-service",
      db: {
        total: pool.total,
        idle: pool.idle,
        active: pool.active,
        waiting: pool.waiting,
      },
    });
  });

  app.get("/metrics", metricsRoute);

  app.use(notFoundHandler);

  app.use(errorHandler);

  return app;
};
