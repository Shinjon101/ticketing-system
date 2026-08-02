import { drizzle, eq } from "@ticketing/db";
import { Pool } from "pg";
import { users } from "./schema";
import bcrypt from "bcryptjs";

const connectionString = process.env.DATABASE_URL;
const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD;

const BCRYPT_ROUNDS = 12;

if (!connectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

if (!adminEmail || !adminPassword) {
  console.log("ADMIN_EMAIL/ADMIN_PASSWORD not set");
  process.exit(0);
}

const pool = new Pool({ connectionString });
const db = drizzle({ client: pool, schema: { users } });

const [existing] = await db
  .select()
  .from(users)
  .where(eq(users.email, adminEmail))
  .limit(1);

if (existing) {
  if (existing.role !== "admin") {
    await db
      .update(users)
      .set({ role: "admin" })
      .where(eq(users.email, adminEmail));
    console.log(`Promoted existing user ${adminEmail} to admin`);
  } else {
    console.log(`${adminEmail} is already admin — nothing to do`);
  }
} else {
  const passwordHash = await bcrypt.hash(adminPassword, BCRYPT_ROUNDS);
  await db
    .insert(users)
    .values({ email: adminEmail, passwordHash, role: "admin" });
  console.log(`Bootstrapped admin user ${adminEmail}`);
}

await pool.end();
