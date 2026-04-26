import { Application } from "express";
import express from "express";
import cookieParser from "cookie-parser";
import logger from "@/config/logger";
import { authRouter } from "@/auth/auth.routes";
import { userRouter } from "@/users/user.routes";
import { getPoolStats } from "@/db";
import { errorHandler } from "@/middleware/error-handler";

export const createApp = (): Application => {
  const app = express();

  app.use(express.json());

  app.use(cookieParser());

  app.use((req, _res, next) => {
    logger.debug({ method: req.method, path: req.path }, "Incoming Request");
    next();
  });

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

  app.use((_req, res) => {
    res.status(404).json({ error: "Route not found" });
  });

  app.use(errorHandler);

  return app;
};
