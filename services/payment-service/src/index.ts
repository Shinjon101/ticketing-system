import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { connectDB, disconnectDB } from "./db";

const start = async () => {
  await connectDB();

  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "Payment service started");
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutdown signal received");
    server.close(async () => {
      await sleep(2_000);
      await disconnectDB();
      logger.info("Payment service shutdown complete");
      process.exit(0);
    });
    setTimeout(() => {
      logger.error("Shutdown timeout");
      process.exit(1);
    }, 15_000);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("unhandledRejection", (reason) => {
    logger.fatal({ reason }, "Unhandled rejection");
    process.exit(1);
  });
  process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "Uncaught exception");
    process.exit(1);
  });
};

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

void start();
