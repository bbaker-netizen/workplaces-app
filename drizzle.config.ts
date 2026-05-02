import type { Config } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — copy .env.example to .env.local and fill it in.");
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
