import { createLogger, Logger } from "@ticketing/common";
import { env } from "./env";

const logger: Logger = createLogger({
  name: "booking-service",
  level: env.LOG_LEVEL,
});
export default logger;
