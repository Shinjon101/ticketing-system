import type { RequestHandler } from "express";
import client from "prom-client";

export const createMetricsRoute = (
  register: client.Registry,
): RequestHandler => {
  return async (_req, res) => {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  };
};
