#!/usr/bin/env node
/**
 * Terminology pass: "Coach" → "Business Builder" in user-visible
 * strings. Workplaces does Business Building (a mix of coaching and
 * consulting), not just coaching.
 *
 * Leaves alone:
 *   - URL routes (/coach/*) — would break bookmarks
 *   - File and component names — internal-only
 *   - Function names (listCoachActionItems, etc.) — internal-only
 *   - DB columns (coach_id, coaches table) — schema invariants
 *   - Role enum value "coach" — stored value
 *   - Comments mentioning coach — incidental
 *
 * Touches only string literals that show up in the UI.
 */

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["app", "components", "lib"];
const EXTS = new Set([".tsx", ".ts"]);

// Long phrases first so they don't get partially matched by shorter
// patterns below. Case-sensitive.
const REPLACEMENTS = [
  // Lowercase "coach guide" / "coach console" specifically when used
  // in copy. Capital-C variants are handled below.
  ["coach guide", "Business Builder guide"],
  ["coach console", "Business Builder Console"],
  ["coach home", "Business Builder home"],
  ["coach role", "Business Builder role"],
  ["coach is", "Business Builder is"],
  ["coach has", "Business Builder has"],
  ["coach can", "Business Builder can"],
  ["coach will", "Business Builder will"],
  ["coach can't", "Business Builder can't"],
  ["coach reviews", "Business Builder reviews"],
  ["coach writes", "Business Builder writes"],
  ["coach decides", "Business Builder decides"],
  ["coach should", "Business Builder should"],
  ["coach must", "Business Builder must"],
  ["a coach (Bruce, Jen,", "a Business Builder (Bruce, Jen,"],
  ["each coach", "each Business Builder"],
  ["per coach", "per Business Builder"],
  ["solo coach", "solo Business Builder"],
  ["coach login", "Business Builder login"],
  ["coach work", "Business Builder work"],

  // Compound labels we use as UI eyebrows / nav.
  ["Coach Console", "Business Builder Console"],
  ["Coach guide", "Business Builder guide"],
  ["Coach operating guide", "Business Builder operating guide"],
  ["Coach side", "Business Builder side"],
  ["coach side", "Business Builder side"],
  ["Coach-only", "Business Builders only"],
  ["Coaches only", "Business Builders only"],
  ["Coaches only.", "Business Builders only."],

  // The work itself.
  ["coaching engagement", "Business Building engagement"],
  ["coaching engagements", "Business Building engagements"],
  ["coaching client", "Business Building client"],
  ["coaching clients", "Business Building clients"],
  ["coaching practice", "Business Building practice"],
  ["coaching service", "Business Building service"],
  ["coaching services", "Business Building services"],
  ["coaching session", "Business Building session"],
  ["coaching sessions", "Business Building sessions"],
  ["coaching work", "Business Building work"],
  ["coaching time", "Business Building time"],
  ["Workplaces coaches", "Workplaces Business Builders"],

  // The role / person.
  ["a new coach", "a new Business Builder"],
  ["A new coach", "A new Business Builder"],
  ["new coach", "new Business Builder"],
  ["New coach", "New Business Builder"],
  ["the coach", "the Business Builder"],
  ["The coach", "The Business Builder"],
  ["your coach", "your Business Builder"],
  ["Your coach", "Your Business Builder"],
  ["from the coach", "from the Business Builder"],
  ["From the coach", "From the Business Builder"],
  ["as a coach", "as a Business Builder"],
  ["business coach", "Business Builder"],
  ["Business coach", "Business Builder"],
  ["business builder/coach consultant", "Business Builder"],
  ["coach/consultant", "Business Builder"],
  ["coach consultant", "Business Builder"],

  // Tour and guide specific phrasing.
  ["operating system as a coach", "operating system as a Business Builder"],
  ["coach experience", "Business Builder experience"],
  ["coach workflow", "Business Builder workflow"],
  ["coach lifecycle", "Business Building lifecycle"],
  ["coach-side", "Business-Builder-side"],
  ["coach home base", "Business Builder home base"],
];

const SKIP = new Set([
  // Migration scripts themselves — they reference the old strings
  // intentionally as the search side of a replacement pair.
  "scripts/migrate-colors.mjs",
  "scripts/migrate-shapes.mjs",
  "scripts/rename-portal.mjs",
  "scripts/rename-coach-to-builder.mjs",
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

console.log(`\nDone — ${touched} file(s) touched.`);
