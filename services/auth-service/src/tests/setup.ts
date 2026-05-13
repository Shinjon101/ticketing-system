import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envTestPath = path.resolve(__dirname, "../../.env.test");

dotenv.config({ path: envTestPath });

const required = ["DATABASE_URL", "JWT_PRIVATE_KEY", "JWT_PUBLIC_KEY"];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`\n[test setup] Missing required env var: ${key}`);
    console.error(
      `[test setup] Make sure .env.test exists at the service root.\n`,
    );
    process.exit(1);
  }
}
