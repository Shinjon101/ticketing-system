import client, { register } from "prom-client";

export interface MetricsRegistryOptions {
  serviceName: string;
}

export const createMetricsRegistry = (
  options: MetricsRegistryOptions,
): client.Registry => {
  const { serviceName } = options;
  const register = new client.Registry();

  register.setDefaultLabels({ serviceName });

  client.collectDefaultMetrics({ register });

  return register;
};
