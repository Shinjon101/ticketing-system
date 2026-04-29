import { connectDB, disconnectDB } from "@/db";
import { createKafkaProducer } from "@/kafka";
import { startOutboxPoller, stopOutboxPoller } from "@/outbox/outbox.poller";
import { createApp } from "@/app";
import { env } from "@/config/env";
import logger from "@/config/logger";
import { connectRedis, disconnectRedis } from "./redis";

const start = async () => {
  await connectDB();

  await connectRedis();

  const producer = createKafkaProducer();
  await producer.connect();

  void startOutboxPoller(producer);

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, "Event service started");
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutdown signal received");

    server.close(async () => {
      logger.info("HTTP server closed");

      // Signal the poller to stop after its current cycle finishes
      stopOutboxPoller();

      // Give the poller up to 2 seconds to finish its current cycle
      await new Promise((resolve) => setTimeout(resolve, 2_000));

      await producer.disconnect();
      await disconnectRedis();
      await disconnectDB();

      logger.info("Event service shutdown complete");
      process.exit(0);
    });

    setTimeout(() => {
      logger.error("Graceful shutdown timed out: forcing exit");
      process.exit(1);
    }, 15_000);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  process.on("unhandledRejection", (reason) => {
    logger.fatal({ reason }, "Unhandled promise rejection");
    process.exit(1);
  });

  process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "Uncaught exception");
    process.exit(1);
  });
};

void start();
