import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    name: "auth-service",
    environment: "node",
    globals: true,

    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "error",
      JWT_ACCESS_EXPIRES_IN: "15m",
      JWT_REFRESH_EXPIRES_IN: "7d",
    },

    setupFiles: ["./src/tests/setup.ts"],

    include: ["src/tests/**/*.test.ts"],

    isolate: true,

    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/index.ts",
        "src/db/migrate.ts",
        "src/db/migrations/**",
        "src/tests/**",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
      },
    },
  },

  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
