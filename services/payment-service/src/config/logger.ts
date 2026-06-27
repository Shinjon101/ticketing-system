import { createLogger, Logger } from "@ticketing/common";
import { env } from "./env";

export const logger: Logger = createLogger({
  name: "payment-service",
  level: env.LOG_LEVEL,
});
