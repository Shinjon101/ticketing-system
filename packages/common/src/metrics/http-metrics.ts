import client from "prom-client";
import type { NextFunction, Request, RequestHandler, Response } from "express";

export const createHttpMetrics = (
  register: client.Registry,
): RequestHandler => {
  const httpRequestDuration = new client.Histogram({
    name: "http_request_duration_seconds",
    help: "Duration of HTTP requests in seconds",
    labelNames: ["method", "route", "status_code"],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [register],
  });

  const httpRequestsTotal = new client.Counter({
    name: "http_requests_total",
    help: "Total number of HTTP requests",
    labelNames: ["method", "route", "status_code"],
    registers: [register],
  });

  return (req: Request, res: Response, next: NextFunction): void => {
    const endTimer = httpRequestDuration.startTimer();

    res.on("finish", () => {
      const route =
        req.route?.path ?? (res.statusCode === 404 ? "unmatched" : req.path);

      const labels = {
        method: req.method,
        route,
        status_code: String(res.statusCode),
      };

      httpRequestsTotal.inc(labels);
      endTimer(labels);
    });

    next();
  };
};
