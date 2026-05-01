import { createLogger } from "@ticketing/common";
import { env } from "./env";

export const logger = createLogger({
  name: "inventory-service",
  level: env.LOG_LEVEL,
});
