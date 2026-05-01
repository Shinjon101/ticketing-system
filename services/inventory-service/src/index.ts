import { connectDB, disconnectDB } from "@/db";
import { connectRedis, disconnectRedis } from "@/redis";
import { createKafkaProducer, startKafkaConsumer } from "@/kafka";
import { createApp } from "@/app";
import { env } from "@/config/env";
import { logger } from "@/config/logger";

const start = async () => {
  await connectDB();

  await connectRedis();

  const producer = createKafkaProducer();
  await producer.connect();

  const stopConsumer = await startKafkaConsumer(producer);

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV },
      "Inventory service started",
    );
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutdown signal received");

    server.close(async () => {
      logger.info("HTTP server closed");

      await stopConsumer();
      await producer.disconnect();
      await disconnectRedis();
      await disconnectDB();

      logger.info("Inventory service shutdown complete");
      process.exit(0);
    });

    setTimeout(() => {
      logger.error("Shutdown timeout - forcing exit");
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
