#!/usr/bin/env node
/**
 * Round 2 of the design refresh: shape adjustments.
 *
 * Per the TBB brand: buttons are pills (radius 9999), cards are
 * `lg` (16px). Inputs stay `md` (10px). The migration only touches
 * spots that look like buttons — anything inside a <button>, an
 * inline-flex element styled like a CTA, or an anchor styled like
 * a button. Cards and chips stay as-is.
 *
 * Heuristic: any `rounded-md` on a className string that ALSO
 * contains `bg-tbb-blue`, `bg-tbb-navy`, `text-white`, or `text-tbb-cream`
 * is treated as a button and upgraded to `rounded-pill`. Other
 * `rounded-md` usages (cards, dividers, callouts) are left alone.
 */

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["app", "components"];
const EXTS = new Set([".tsx", ".ts"]);

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

// Match a className string and find the class list. Then in that
// list, detect button-like usage and swap rounded-md -> rounded-pill.
const CLASSNAME_RE = /className\s*=\s*"([^"]*)"|className\s*=\s*\{`([^`]*)`\}/g;
const BUTTON_HINTS = [
  "bg-tbb-blue",
  "bg-tbb-navy",
  "text-white",
  "uppercase",
];

let touched = 0;
const files = ROOTS.flatMap((r) => walk(r));

for (const path of files) {
  const original = readFileSync(path, "utf8");
  const updated = original.replace(CLASSNAME_RE, (match, doubleStr, templateStr) => {
    const value = doubleStr ?? templateStr ?? "";
    if (!value.includes("rounded-md")) return match;
    const looksLikeButton = BUTTON_HINTS.some((hint) => value.includes(hint));
    if (!looksLikeButton) return match;
    const newValue = value.replace(/rounded-md/g, "rounded-pill");
    if (doubleStr != null) {
      return `className="${newValue}"`;
    }
    return `className={\`${newValue}\`}`;
  });
  if (updated !== original) {
    writeFileSync(path, updated);
    touched += 1;
    console.log(`  ${path}`);
  }
}

console.log(`\nDone — ${touched} file(s) updated to pill buttons.`);
