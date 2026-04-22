import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import type { Logger } from "pino";

export interface DbConfig<TSchema extends Record<string, unknown>> {
  connectionString: string;

  serviceName: string;

  schema: TSchema;

  logger?: Logger;

  pool?: {
    max?: number;

    idleTimeoutMs?: number;

    connectionTimeoutMs?: number;

    statementTimeoutMs?: number;
  };

  startup?: {
    maxRetries?: number;

    retryDelayMs?: number;
  };
}

export interface PoolStats {
  total: number;
  idle: number;
  waiting: number;
  active: number;
}

export interface DbClient<TSchema extends Record<string, unknown>> {
  db: NodePgDatabase<TSchema>;

  connectDB: () => Promise<void>;

  disconnectDB: () => Promise<void>;

  getPoolStats: () => PoolStats;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const safeParseUrl = (
  connectionString: string,
): { hostname: string; port: string; database: string } => {
  try {
    const url = new URL(connectionString);
    return {
      hostname: url.hostname,
      port: url.port || "5432",
      database: url.pathname.slice(1),
    };
  } catch {
    return { hostname: "unknown", port: "5432", database: "unknown" };
  }
};

export function createDb<TSchema extends Record<string, unknown>>(
  config: DbConfig<TSchema>,
): DbClient<TSchema> {
  const {
    connectionString,
    serviceName,
    schema,
    logger,
    pool: poolConfig = {},
    startup: startupConfig = {},
  } = config;

  const {
    max = 10,
    idleTimeoutMs = 30_000,
    connectionTimeoutMs = 5_000,
    statementTimeoutMs = 30_000,
  } = poolConfig;

  const { maxRetries = 3, retryDelayMs = 1_000 } = startupConfig;

  const pgOptions = [
    `-c application_name=${serviceName}`,
    `-c statement_timeout=${statementTimeoutMs}`,
  ].join(" ");

  const poolOptions: PoolConfig = {
    connectionString,
    max,
    idleTimeoutMillis: idleTimeoutMs,
    connectionTimeoutMillis: connectionTimeoutMs,
    options: pgOptions,
  };

  const pool = new Pool(poolOptions);

  pool.on("connect", (client) => {
    logger?.debug(
      { serviceName, processId: client.processID },
      "New DB connection established",
    );
  });

  pool.on("acquire", (client) => {
    logger?.debug(
      { serviceName, processId: client.processID },
      "DB connection acquired from pool",
    );
  });

  pool.on("remove", (client) => {
    logger?.debug(
      { serviceName, processId: client.processID },
      "DB connection removed from pool",
    );
  });

  pool.on("error", (err, client) => {
    logger?.error(
      { err, serviceName, processId: client.processID },
      "Unexpected DB pool error : connection will be replaced",
    );
  });

  const db = drizzle({
    client: pool,
    schema,
    logger: logger
      ? {
          logQuery(query, params) {
            logger.debug({ query, params }, "DB query");
          },
        }
      : false,
  });

  const getPoolStats = (): PoolStats => ({
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
    active: pool.totalCount - pool.idleCount,
  });

  const connectDB = async (): Promise<void> => {
    const { hostname, port, database } = safeParseUrl(connectionString);
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        await pool.query("SELECT 1");

        logger?.info(
          {
            serviceName,
            host: hostname,
            port,
            database,
            pool: { max, idleTimeoutMs, statementTimeoutMs },
          },
          "Database connected",
        );
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt <= maxRetries) {
          const delayMs = retryDelayMs * Math.pow(2, attempt - 1);
          logger?.warn(
            {
              attempt,
              maxRetries,
              delayMs,
              host: hostname,
              error: lastError.message,
            },
            `Database connection failed — retrying in ${delayMs}ms`,
          );

          await sleep(delayMs);
        }
      }
    }

    logger?.error(
      {
        host: hostname,
        database,
        attempts: maxRetries + 1,
        error: lastError?.message,
      },
      "Database connection failed after all retries — exiting",
    );
    process.exit(1);
  };

  const disconnectDB = async (): Promise<void> => {
    try {
      logger?.info({ serviceName }, "Closing database pool...");
      await pool.end();
      logger?.info({ serviceName }, "Database pool closed");
    } catch (error) {
      logger?.error({ error, serviceName }, "Error closing database pool");
    }
  };

  return { db, connectDB, disconnectDB, getPoolStats };
}
