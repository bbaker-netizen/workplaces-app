import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Config } from "drizzle-kit";

/**
 * Load `.env.local` for drizzle-kit invocations. Next.js loads this
 * automatically at runtime; the drizzle CLI does not. Inline parser
 * avoids a separate dotenv dependency.
 */
const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set — copy .env.example to .env.local and fill it in.",
  );
}

export default {
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // RLS policies live in handwritten SQL files alongside the generated
  // migrations. drizzle-kit doesn't yet generate RLS; we apply policies
  // through the migrate runner.
  verbose: true,
  strict: true,
} satisfies Config;
