import { drizzle, migrate } from "@ticketing/db";
import { Pool } from "pg";

//reads DATABASE_URL directly from process.env so that migration failures are loud and obvious.

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL environment variable is required");
  process.exit(1);
}

const pool = new Pool({ connectionString });
const db = drizzle({ client: pool });

console.log("Running migrations...");

await migrate(db, {
  migrationsFolder: "./src/db/migrations",
});

console.log("Migrations complete");
await pool.end();
