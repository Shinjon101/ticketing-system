import { defineConfig } from "drizzle-kit";
import "dotenv/config";
import { env } from "../auth-service/src/config/env";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/**/*.table.ts",
  out: "./src/db/migrations",
  dbCredentials: {
    url: env.DATABASE_URL,
  },
  verbose: true,
  strict: true,
});
