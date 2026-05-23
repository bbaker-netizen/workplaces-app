#!/usr/bin/env node
/**
 * Production migrate — runs every .sql file in lib/db/migrations/
 * that hasn't been applied yet, tracked in a small `_app_migrations`
 * audit table.
 *
 * Why not `drizzle-kit migrate`? Drizzle's runner only applies
 * migrations listed in `meta/_journal.json`. We have raw SQL files
 * (0031+) added manually that aren't in the journal. This runner
 * reads the filesystem directly and applies anything pending in
 * lexical order — bulletproof against any of our raw-SQL additions.
 *
 * Lifecycle on each invocation:
 *   1. Skip when DATABASE_URL is unset (preview builds) or
 *      SKIP_DB_MIGRATE=1.
 *   2. Connect using DATABASE_URL_OWNER (DDL rights) or
 *      DATABASE_URL.
 *   3. CREATE TABLE IF NOT EXISTS _app_migrations (filename PK,
 *      applied_at).
 *   4. List .sql files in lib/db/migrations/, sort lexically.
 *   5. For each file, if not in _app_migrations: execute the file,
 *      INSERT into _app_migrations. On failure log + skip (build
 *      continues unless FAIL_BUILD_ON_MIGRATE_ERROR=1).
 *
 * Idempotent at multiple layers: the SQL files use `IF NOT EXISTS`
 * guards, AND _app_migrations tracks what's already run. Safe to
 * invoke repeatedly.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skip = process.env.SKIP_DB_MIGRATE === "1";
const failOnError = process.env.FAIL_BUILD_ON_MIGRATE_ERROR === "1";
const databaseUrl =
  process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL ?? "";

if (skip) {
  console.log("[migrate-on-deploy] SKIP_DB_MIGRATE=1; skipping.");
  process.exit(0);
}
if (!databaseUrl) {
  console.log(
    "[migrate-on-deploy] No DATABASE_URL/DATABASE_URL_OWNER set; skipping.",
  );
  process.exit(0);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, "..", "lib", "db", "migrations");

let neonModule;
try {
  neonModule = await import("@neondatabase/serverless");
} catch (e) {
  console.error(
    "[migrate-on-deploy] @neondatabase/serverless not installed; cannot connect.",
    e,
  );
  process.exit(failOnError ? 1 : 0);
}

// Neon's WebSocket Pool supports multi-statement SQL via `client.query`
// — the HTTP-tagged-template API doesn't. We open one pooled client,
// run everything inside it, then end.
const { Pool, neonConfig } = neonModule;
// In Node we need the WebSocket polyfill. Try to load `ws`; if it's
// not present we fall back to letting the driver try its bundled one.
try {
  const ws = await import("ws");
  neonConfig.webSocketConstructor = ws.default ?? ws;
} catch {
  // not fatal — Vercel/Netlify Node 20+ has WebSocket built in
}

const pool = new Pool({ connectionString: databaseUrl });
const client = await pool.connect();

async function exec(query, params) {
  return client.query(query, params);
}

async function ensureTrackingTable() {
  await exec(
    `CREATE TABLE IF NOT EXISTS _app_migrations (
       filename text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );
}

async function getAppliedSet() {
  const res = await exec(`SELECT filename FROM _app_migrations`);
  return new Set(res.rows.map((r) => r.filename));
}

async function listMigrationFiles() {
  const entries = await readdir(migrationsDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".sql"))
    .map((e) => e.name)
    .sort();
}

async function applyOne(filename) {
  const filePath = path.join(migrationsDir, filename);
  const body = await readFile(filePath, "utf8");
  if (!body.trim()) {
    console.log(`[migrate-on-deploy] ${filename}: empty, skipping.`);
    return true;
  }
  console.log(`[migrate-on-deploy] ${filename}: applying…`);
  try {
    // pg's `query` method accepts multi-statement SQL when the body
    // doesn't have parameters. All our migrations are static DDL —
    // safe to send as one blob.
    await client.query(body);
    await exec(
      `INSERT INTO _app_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING`,
      [filename],
    );
    console.log(`[migrate-on-deploy] ${filename}: ✓ applied.`);
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[migrate-on-deploy] ${filename}: FAILED — ${msg}`);
    return false;
  }
}

async function main() {
  await ensureTrackingTable();
  const applied = await getAppliedSet();
  const files = await listMigrationFiles();

  // Files <= 0030 were applied by Drizzle's journal before we switched
  // to this runner. Mark them as already-applied so the audit table
  // reflects reality, but don't re-run them.
  const PRE_JOURNAL_LIMIT = 30;
  for (const filename of files) {
    const numMatch = /^(\d{4})_/.exec(filename);
    const num = numMatch ? parseInt(numMatch[1], 10) : 9999;
    if (num <= PRE_JOURNAL_LIMIT) {
      if (!applied.has(filename)) {
        await exec(
          `INSERT INTO _app_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING`,
          [filename],
        );
      }
      continue;
    }
    if (applied.has(filename)) {
      console.log(`[migrate-on-deploy] ${filename}: already applied, skipping.`);
      continue;
    }
    const ok = await applyOne(filename);
    if (!ok && failOnError) {
      client.release();
      await pool.end();
      process.exit(1);
    }
  }
  client.release();
  await pool.end();
  console.log("[migrate-on-deploy] Done.");
}

try {
  await main();
} catch (e) {
  console.error("[migrate-on-deploy] Fatal:", e);
  if (failOnError) process.exit(1);
  process.exit(0);
}
