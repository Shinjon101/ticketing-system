import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    name: "booking-service:integration",
    environment: "node",
    globals: true,
    include: ["src/tests/integration/**/*.test.ts"],
    globalSetup: ["./src/tests/integration/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: "forks",
    maxWorkers: 1,
    isolate: false,
  },
  resolve: { alias: { "@": resolve(__dirname, "./src") } },
});
