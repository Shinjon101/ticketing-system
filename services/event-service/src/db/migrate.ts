import { Pool } from "pg";
import "dotenv/config";
import { drizzle, migrate } from "@ticketing/db";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL environment variable is required");
  process.exit(1);
}

const pool = new Pool({ connectionString });
const db = drizzle({ client: pool });

console.log("Running event-service migrations...");
await migrate(db, { migrationsFolder: "./src/db/migrations" });
console.log("Migrations complete");

await pool.end();
