import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    name: "inventory-service:unit",
    environment: "node",
    globals: true,
    clearMocks: true,
    include: ["src/tests/unit/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
});
