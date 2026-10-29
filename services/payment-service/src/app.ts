import express, { type Application } from "express";
import {
  createHttpLogger,
  errorHandler,
  notFoundHandler,
} from "@ticketing/common";
import { logger } from "./config/logger";
import { getPoolStats } from "./db";
import { paymentRouter } from "./payment/payment.routes";
import { httpMetricsMiddleware, metricsRoute } from "./metrics";

export const createApp = (): Application => {
  const app = express();

  app.use(createHttpLogger(logger));

  app.use(httpMetricsMiddleware);

  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody: string }).rawBody =
          buf.toString("utf8");
      },
    }),
  );

  app.use("/payments", paymentRouter);

  app.get("/metrics", metricsRoute);

  app.get("/health", (_req, res) => {
    const pool = getPoolStats();
    const isDegraded = pool.waiting > 0 && pool.active / pool.total > 0.9;
    res.status(isDegraded ? 503 : 200).json({
      status: isDegraded ? "degraded" : "ok",
      service: "payment-service",
      db: pool,
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
};
