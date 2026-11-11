import client from "prom-client";

// Structural subset of PoolStats from @ticketing/db.
export interface PoolStatsSnapshot {
  active: number;
  idle: number;
  waiting: number;
  max: number;
}

// Gauges read the pool at scrape time via collect(), so there is no timer and
// the value is never stale.
export const registerDbPoolMetrics = (
  register: client.Registry,
  getStats: () => PoolStatsSnapshot,
): void => {
  new client.Gauge({
    name: "db_pool_connections",
    help: "Connections in the pool, by state",
    labelNames: ["state"],
    registers: [register],
    collect() {
      const stats = getStats();
      this.set({ state: "active" }, stats.active);
      this.set({ state: "idle" }, stats.idle);
    },
  });

  new client.Gauge({
    name: "db_pool_max_connections",
    help: "Configured maximum size of the pool",
    registers: [register],
    collect() {
      this.set(getStats().max);
    },
  });

  // Above 0 means queries are queuing for a connection, so the pool is the
  // bottleneck rather than Postgres itself.
  new client.Gauge({
    name: "db_pool_waiting_clients",
    help: "Queries waiting for a free connection",
    registers: [register],
    collect() {
      this.set(getStats().waiting);
    },
  });
};
