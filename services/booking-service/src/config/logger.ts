import { createLogger } from "@ticketing/common";
import { env } from "./env";

export const logger = createLogger({
  name: "booking-service",
  level: env.LOG_LEVEL,
  pretty: env.LOG_PRETTY,
});
