import { drizzle, migrate } from "@ticketing/db";
import { createEnv, createLogger, logLevelSchema, z } from "@ticketing/common";
import { Pool } from "pg";
import "dotenv/config";
import { fileURLToPath } from "url";
import path from "path";

//reads DATABASE_URL directly from process.env so that migration failures are loud and obvious.

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const JOB_NAME = "inventory-service-migrate";

const env = createEnv(
  z.object({
    DATABASE_URL: z.string().url(),
    LOG_LEVEL: logLevelSchema.default("info"),
  }),
  { serviceName: JOB_NAME },
);

const logger = createLogger({ name: JOB_NAME, level: env.LOG_LEVEL });

const pool = new Pool({ connectionString: env.DATABASE_URL });
const db = drizzle({ client: pool });

logger.info("Running migrations");

try {
  await migrate(db, {
    migrationsFolder: path.resolve(__dirname, "migrations"),
  });
  logger.info("Migrations complete");
} catch (err) {
  logger.error({ err }, "Migrations failed");
  process.exitCode = 1;
} finally {
  await pool.end();
}
