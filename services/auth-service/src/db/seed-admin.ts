import { drizzle, eq } from "@ticketing/db";
import { createEnv, createLogger, logLevelSchema, z } from "@ticketing/common";
import { Pool } from "pg";
import { users } from "./schema";
import bcrypt from "bcryptjs";

const JOB_NAME = "auth-service-seed-admin";

const env = createEnv(
  z.object({
    DATABASE_URL: z.string().url(),
    ADMIN_EMAIL: z
      .string()
      .min(1)
      .transform((email) => email.toLowerCase()),
    ADMIN_PASSWORD: z.string().min(1),
    LOG_LEVEL: logLevelSchema.default("info"),
  }),
  { serviceName: JOB_NAME },
);

const logger = createLogger({ name: JOB_NAME, level: env.LOG_LEVEL });

const BCRYPT_ROUNDS = 12;

const pool = new Pool({ connectionString: env.DATABASE_URL });
const db = drizzle({ client: pool, schema: { users } });

const run = async () => {
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, env.ADMIN_EMAIL))
    .limit(1);

  if (existing) {
    if (existing.role !== "admin") {
      await db
        .update(users)
        .set({ role: "admin" })
        .where(eq(users.email, env.ADMIN_EMAIL));
      logger.info({ userId: existing.id }, "Promoted existing user to admin");
    } else {
      logger.info({ userId: existing.id }, "User is already admin");
    }
    return;
  }

  const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, BCRYPT_ROUNDS);
  const [created] = await db
    .insert(users)
    .values({ email: env.ADMIN_EMAIL, passwordHash, role: "admin" })
    .returning({ id: users.id });
  logger.info({ userId: created?.id }, "Bootstrapped admin user");
};

try {
  await run();
} catch (err) {
  logger.error({ err }, "Admin seed failed");
  process.exitCode = 1;
} finally {
  await pool.end();
}
