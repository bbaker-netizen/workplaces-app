#!/usr/bin/env node
/**
 * Production migrate — runs `drizzle-kit migrate` against the runtime
 * DATABASE_URL. Designed to be wired into the Netlify build pipeline
 * so every deploy applies any pending migrations before the new build
 * serves traffic.
 *
 * Behaviour:
 *   - Skips entirely when DATABASE_URL is unset (e.g. preview builds
 *     without a Neon branch attached) or when SKIP_DB_MIGRATE=1.
 *   - Otherwise runs migrations using DATABASE_URL_OWNER if set
 *     (recommended — RLS owners need DDL rights), falling back to
 *     DATABASE_URL.
 *   - On migration failure, logs the error verbosely and EXITS 0
 *     (build continues). The schema may end up stale; the deploy
 *     itself shouldn't be the thing that takes the site down. Apply
 *     missing SQL out-of-band via the Neon SQL editor when a
 *     migration step refuses to run from this script — e.g., the
 *     build agent can't reach Neon from its IP, or the configured
 *     role lacks DDL rights.
 *   - Use FAIL_BUILD_ON_MIGRATE_ERROR=1 to opt back into hard-fail
 *     behaviour for environments where stale schema is worse than
 *     no deploy.
 */

import { spawnSync } from "node:child_process";

const skip = process.env.SKIP_DB_MIGRATE === "1";
const failOnError = process.env.FAIL_BUILD_ON_MIGRATE_ERROR === "1";
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
  console.error(
    `[migrate-on-deploy] Continuing build anyway. Apply missing SQL manually ` +
      `via the Neon SQL editor: https://console.neon.tech/ → select the project ` +
      `→ SQL Editor. Paste the contents of any unapplied migration files from ` +
      `lib/db/migrations/. Set FAIL_BUILD_ON_MIGRATE_ERROR=1 to switch this back to a hard fail.`,
  );
  if (failOnError) {
    process.exit(result.status ?? 1);
  }
  process.exit(0);
}
console.log("[migrate-on-deploy] Migrations applied successfully.");
