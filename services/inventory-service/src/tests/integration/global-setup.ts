import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";

let container: StartedPostgreSqlContainer;

export async function setup(): Promise<void> {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  process.env.DATABASE_URL = container.getConnectionUri();
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "error";
  process.env.KAFKA_BROKERS = "localhost:9092";
  process.env.REDIS_URL = "redis://localhost:6379";

  const { drizzle, migrate } = await import("@ticketing/db");
  const { Pool } = await import("pg");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await migrate(drizzle({ client: pool }), {
    migrationsFolder: "./src/db/migrations",
  });
  await pool.end();
}

export async function teardown(): Promise<void> {
  await container.stop();
}
