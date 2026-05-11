#!/usr/bin/env node
/**
 * One-shot color migration from the Heritage Industrial palette (the
 * v1 brand) to The Business Builders palette (the v2 brand). Walks
 * every .tsx/.ts under app/, components/, and lib/, replacing hex
 * literals with TBB Tailwind tokens.
 *
 * Run once, commit the result.
 */

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["app", "components", "lib"];
const EXTS = new Set([".tsx", ".ts"]);

// Order matters: longer / more specific replacements first.
const REPLACEMENTS = [
  // Hover-on-dark patterns first so they don't get scooped up by the
  // generic dark-bg replacement.
  ["hover:bg-[#2E4057]", "hover:bg-tbb-blue-700"],
  ["hover:border-[#2E4057]", "hover:border-tbb-blue"],
  ["hover:text-[#2E4057]", "hover:text-tbb-blue"],
  ["focus:ring-[#2E4057]", "focus:ring-tbb-blue"],

  // Foreman Black surfaces and text (the old primary).
  ["bg-[#1A1A1A]", "bg-tbb-blue"],
  ["text-[#1A1A1A]", "text-tbb-navy"],
  ["border-[#1A1A1A]", "border-tbb-navy"],

  // Steel Blue (old secondary / link / accent).
  ["bg-[#2E4057]", "bg-tbb-blue-700"],
  ["text-[#2E4057]", "text-tbb-navy"],
  ["border-[#2E4057]", "border-tbb-blue"],

  // Drafting Cream (old warm surface).
  ["bg-[#F5F1E8]", "bg-tbb-cream-50"],
  ["text-[#F5F1E8]", "text-white"],
  ["border-[#F5F1E8]", "border-tbb-cream"],

  // Safety Vest Orange (old single accent — became TBB danger).
  ["bg-[#E87722]", "bg-tbb-danger"],
  ["text-[#E87722]", "text-tbb-danger"],
  ["border-[#E87722]", "border-tbb-danger"],

  // Neutral Grey 2 (#CCCCCC) — old hairlines and dividers.
  ["bg-[#CCCCCC]", "bg-tbb-line"],
  ["text-[#CCCCCC]", "text-tbb-line"],
  ["border-[#CCCCCC]", "border-tbb-line"],
  ["divide-[#CCCCCC]", "divide-tbb-line"],

  // Neutral Grey 1 (#666666) — old muted text.
  ["text-[#666666]", "text-tbb-ink-3"],
  ["border-[#666666]", "border-tbb-ink-3"],
  ["bg-[#666666]", "bg-tbb-ink-3"],

  // Font-family migrations.
  ["font-display font-bold", "font-bold"],
  ["font-display", "font-bold"],

  // Casing tracking — TBB caps tracking is 0.08em (was 0.15-0.25em).
  // Standardize all upper-case eyebrow labels to the TBB caps tracking.
  ["tracking-[0.25em]", "tracking-tbb-caps"],
  ["tracking-[0.2em]", "tracking-tbb-caps"],
  ["tracking-[0.15em]", "tracking-tbb-caps"],
];

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
let totalReplacements = 0;
const files = ROOTS.flatMap((r) => walk(r));

for (const path of files) {
  const original = readFileSync(path, "utf8");
  let updated = original;
  let fileReplacements = 0;
  for (const [find, replace] of REPLACEMENTS) {
    const before = updated;
    updated = updated.split(find).join(replace);
    fileReplacements += (before.length - updated.length) / Math.max(1, find.length - replace.length);
  }
  if (updated !== original) {
    writeFileSync(path, updated);
    touched += 1;
    totalReplacements += fileReplacements;
    console.log(`  ${path}`);
  }
}

console.log(`\nDone — ${touched} file(s) touched, ~${Math.round(totalReplacements)} replacements.`);
