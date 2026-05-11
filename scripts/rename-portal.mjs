#!/usr/bin/env node
/**
 * Rename pass: "The Builder" → "Business Builder Portal".
 * Only touches user-facing strings; internal code identifiers
 * (Inngest client id "workplaces-the-builder", DB column comments,
 * etc.) stay so we don't churn invariants for cosmetic reasons.
 */

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["app", "components", "lib"];
const EXTS = new Set([".tsx", ".ts"]);

// Order matters: longer strings first so they don't get partially
// matched by shorter rules below.
const REPLACEMENTS = [
  // Brand line variants.
  ['"The Builder · By Workplaces"', '"Business Builder Portal · By Workplaces"'],
  ["'The Builder · By Workplaces'", "'Business Builder Portal · By Workplaces'"],
  ["The Builder · By Workplaces", "Business Builder Portal · By Workplaces"],

  // Stand-alone "The Builder" in titles / metadata / headings.
  ['"The Builder"', '"Business Builder Portal"'],
  ["'The Builder'", "'Business Builder Portal'"],
  ['title: "The Builder', 'title: "Business Builder Portal'],

  // AI prompts that introduce the app by name to a Claude call.
  // These will still produce sensible output after rename.
  ["The Builder is", "Business Builder Portal is"],
  ["The Builder app", "Business Builder Portal"],
];

// Files we should NOT touch (internal-only identifiers).
const SKIP = new Set([
  // Inngest client id is a URL-safe identifier on the Inngest dashboard;
  // leave the historic value.
  "lib/inngest.ts",
]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === ".next" || entry === ".netlify") continue;
      walk(path, out);
    } else {
      const dot = entry.lastIndexOf(".");
      const ext = dot >= 0 ? entry.slice(dot) : "";
      if (EXTS.has(ext)) out.push(path);
    }
  }
  return out;
}

let touched = 0;
const files = ROOTS.flatMap((r) => walk(r));

for (const path of files) {
  const rel = path.replace(/\\/g, "/");
  if ([...SKIP].some((s) => rel.endsWith(s))) continue;
  const original = readFileSync(path, "utf8");
  let updated = original;
  for (const [find, replace] of REPLACEMENTS) {
    updated = updated.split(find).join(replace);
  }
  if (updated !== original) {
    writeFileSync(path, updated);
    touched += 1;
    console.log(`  ${path}`);
  }
}

console.log(`\nDone — ${touched} file(s) renamed.`);
