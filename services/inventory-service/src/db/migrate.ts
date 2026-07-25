import { drizzle, migrate } from "@ticketing/db";
import { Pool } from "pg";
import "dotenv/config";
import { fileURLToPath } from "url";
import path from "path";

//reads DATABASE_URL directly from process.env so that migration failures are loud and obvious.

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL environment variable is required");
  process.exit(1);
}

const pool = new Pool({ connectionString });
const db = drizzle({ client: pool });

console.log("Running migrations...");

await migrate(db, {
  migrationsFolder: path.resolve(__dirname, "migrations"),
});

console.log("Migrations complete");
await pool.end();
