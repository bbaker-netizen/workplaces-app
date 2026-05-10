#!/usr/bin/env node
/**
 * Production migrate — runs `drizzle-kit migrate` against the runtime
 * DATABASE_URL. Designed to be wired into the Netlify build pipeline
 * so every deploy applies any pending migrations before the new
 * build serves traffic.
 *
 * Phase 4. Replaces the manual `pnpm drizzle-kit migrate` step in the
 * Live Impactica handoff runbook.
 *
 * Behaviour:
 *   - Skips entirely when DATABASE_URL is unset (e.g. preview builds
 *     without a Neon branch attached) or when SKIP_DB_MIGRATE=1.
 *   - Otherwise runs migrations using DATABASE_URL_OWNER if set
 *     (recommended — RLS owners need DDL rights), falling back to
 *     DATABASE_URL.
 *   - Exits non-zero on failure so the deploy aborts rather than
 *     serving traffic against a stale schema.
 */

import { spawnSync } from "node:child_process";

const skip = process.env.SKIP_DB_MIGRATE === "1";
const ownerUrl =
  process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL ?? "";

if (skip) {
  console.log("[migrate-on-deploy] SKIP_DB_MIGRATE=1; skipping migrations.");
  process.exit(0);
}
if (!ownerUrl) {
  console.log(
    "[migrate-on-deploy] No DATABASE_URL/DATABASE_URL_OWNER set; skipping migrations.",
  );
  process.exit(0);
}

console.log("[migrate-on-deploy] Running drizzle-kit migrate…");
const result = spawnSync(
  process.platform === "win32" ? "pnpm.cmd" : "pnpm",
  ["drizzle-kit", "migrate"],
  {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: ownerUrl },
  },
);

if (result.status !== 0) {
  console.error(
    `[migrate-on-deploy] drizzle-kit migrate failed (exit ${result.status}).`,
  );
  process.exit(result.status ?? 1);
}
console.log("[migrate-on-deploy] Migrations applied successfully.");
