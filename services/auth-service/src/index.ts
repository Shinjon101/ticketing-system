import { createApp } from "@/app";
import { env } from "@/config/env";
import logger from "@/config/logger";
import { connectDB, disconnectDB } from "@/db";

const start = async () => {
  await connectDB();

  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, "Auth Service Started");
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutdown signal recieved: closing server");

    server.close(async () => {
      logger.info("HTTP server closed");

      await disconnectDB();

      logger.info("Auth service shutdown complete");
      process.exit(0);
    });

    setTimeout(() => {
      logger.error("Graceful shutdown timed out — forcing exit");
      process.exit(1);
    }, 10_000);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  process.on("unhandledRejection", (reason) => {
    logger.fatal({ reason }, "Unhandled promise rejection: shutting down");
    process.exit(1);
  });

  process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "Uncaught exception: shutting down");
    process.exit(1);
  });
};

void start();
