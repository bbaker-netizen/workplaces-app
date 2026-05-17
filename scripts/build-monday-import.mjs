/**
 * One-off: read the saved BBP CRM Monday board dump and emit a
 * SQL file that wipes the existing sample prospects under the
 * master org and inserts the migrated rows.
 *
 * Run locally:
 *   node scripts/build-monday-import.mjs
 *
 * Reads:  C:/Users/deskt/.claude/.../<board-dump>.txt
 * Writes: scripts/import-monday-bbp-crm.sql
 *
 * The output SQL is meant to be pasted into Neon's SQL Editor
 * (https://console.neon.tech) and executed by an owner-role
 * session so RLS doesn't block the writes. The script is
 * idempotent in spirit — re-running it deletes the existing
 * prospects on the master org and replaces them with this
 * import set.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC =
  "C:/Users/deskt/.claude/projects/C--Users-deskt-OneDrive-Application-Build-Workplaces-ERP/ed803332-e3e1-4a0b-adb5-675109b6a703/tool-results/mcp-1bb0cfda-fa7e-4260-832f-97839f299c3e-get_board_items_page-1779060306607.txt";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "import-monday-bbp-crm.sql");

const raw = JSON.parse(fs.readFileSync(SRC, "utf8"));

/**
 * Monday stage label → The Builder prospect status enum.
 * "Select" with no real content gets skipped entirely.
 */
const STAGE_MAP = {
  "New Lead": "new_lead",
  "First Contact": "first_contact",
  "Meeting Scheduled": "meeting_scheduled",
  "Follow-Up": "first_contact", // closest meaningful match
  Negotiation: "negotiation",
  Won: "contract_signed",
  Lost: "lost",
};

/** Strip a malformed email like "x@y.com  - x@y.com" down to the first one. */
function cleanEmail(raw) {
  if (!raw || typeof raw !== "string") return null;
  // Pull the first valid email out of the string.
  const m = raw.match(/[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return m ? m[0].trim().toLowerCase() : null;
}

/** Slugify a name so we can synthesise a placeholder email if needed. */
function placeholderEmail(name, mondayId) {
  const slug = (name || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return `${slug || "unknown"}-${mondayId}@no-email.workplaces.local`;
}

/** SQL-escape a string for single-quoted literal. NULL if null/empty. */
function q(v) {
  if (v == null) return "NULL";
  const s = String(v);
  if (s.length === 0) return "NULL";
  return `'${s.replace(/'/g, "''")}'`;
}

/** Bare number or NULL. */
function n(v) {
  if (v == null || v === "") return "NULL";
  const num = typeof v === "number" ? v : Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(num) ? String(num) : "NULL";
}

/** Strip rich-text wrappers and dig out plain text. Some Monday
 *  long-text fields come back as an object {text, changed_at}. */
function plainText(v) {
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object" && typeof v.text === "string") return v.text;
  return null;
}

/** Pull a YYYY-MM-DD date from various Monday date payloads. */
function dateOnly(v) {
  if (v == null) return null;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return null;
}

const skipped = [];
const rows = [];

for (const item of raw.items) {
  const cv = item.column_values ?? {};

  const stageRaw = cv.color_mkyc1v5z;
  const status = STAGE_MAP[stageRaw];

  // Skip the "Select" placeholders with no other useful signal.
  if (!status) {
    skipped.push({
      id: item.id,
      name: item.name,
      reason: `stage="${stageRaw}" (no mapping)`,
    });
    continue;
  }

  const email = cleanEmail(cv.email_mkyhgdt2);
  const phone = cv.phone_mkyhxppb ? String(cv.phone_mkyhxppb) : null;
  const companyRaw = cv.text_mkycwx0t || null;
  const contactName = item.name || null;
  const company = companyRaw || contactName || "Unknown";
  const contactEmail = email || placeholderEmail(contactName, item.id);

  const monthly = cv.numeric_mkydjhyq
    ? Number(String(cv.numeric_mkydjhyq).replace(/[^\d.-]/g, ""))
    : null;
  // Convert monthly fee → annualised ACV in cents.
  const expectedValueCents =
    monthly != null && Number.isFinite(monthly) ? Math.round(monthly * 12 * 100) : null;

  const leadSource = cv.dropdown_mm188nk3 || null;
  const lostReason = cv.dropdown_mkydwfpm || null;
  const builder = cv.dropdown_mkyd8rf || null;
  const sales = cv.multiple_person_mkydv6yq || null;
  const clientBoard =
    cv.link_mm1818f7 && typeof cv.link_mm1818f7 === "object"
      ? cv.link_mm1818f7.url ?? null
      : null;

  const lastContact = dateOnly(cv.date_mm18b1f7);
  const nextFollowup = dateOnly(cv.date_mkyckypg);
  // Expected close + start_date go into notes — schema has neither yet.
  const expectedClose = dateOnly(cv.date_mm18an1b);
  const startDate = dateOnly(cv.date_mkydy70w);

  // Build the notes field — preserve everything that doesn't have a
  // structured column. Each line tagged so it's easy to scan.
  const noteLines = [];
  const longText = plainText(cv.long_text_mkydp5r3);
  if (longText && longText.trim()) noteLines.push(longText.trim());
  if (lostReason) noteLines.push(`Lost reason: ${lostReason}`);
  if (builder) noteLines.push(`Originally owned by: ${builder} (BBP CRM)`);
  if (sales && sales !== builder) noteLines.push(`Monday salesperson: ${sales}`);
  if (expectedClose) noteLines.push(`Expected close: ${expectedClose}`);
  if (startDate) noteLines.push(`Engagement start date: ${startDate}`);
  if (clientBoard) noteLines.push(`Client board: ${clientBoard}`);
  noteLines.push(`Migrated from Monday BBP CRM (item ${item.id}) on ${new Date().toISOString().slice(0, 10)}.`);
  const notes = noteLines.join("\n\n");

  rows.push({
    mondayId: item.id,
    company,
    contactName,
    contactEmail,
    phone,
    leadSource,
    expectedValueCents,
    nextActionDate: nextFollowup,
    lastContactAt: lastContact,
    status,
    notes,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  });
}

// Dedupe by email — second occurrence wins for notes-append, first wins for fields.
const byEmail = new Map();
const dedupedSkipped = [];
for (const r of rows) {
  if (byEmail.has(r.contactEmail)) {
    const existing = byEmail.get(r.contactEmail);
    existing.notes = `${existing.notes}\n\nDuplicate Monday record merged: ${r.contactName ?? r.company} (Monday id ${r.mondayId})`;
    dedupedSkipped.push({ id: r.mondayId, name: r.contactName, reason: "duplicate email" });
  } else {
    byEmail.set(r.contactEmail, r);
  }
}
const finalRows = Array.from(byEmail.values());

const stamp = new Date().toISOString();

const sql = `-- ============================================================
-- Monday BBP CRM → The Builder · one-off prospect migration
-- Generated ${stamp}
-- Source: BBP CRM board 18391217224 (53 items raw)
-- Imported: ${finalRows.length} prospect rows
-- Skipped: ${skipped.length + dedupedSkipped.length}
--   ${skipped.length} blank "Select" placeholders
--   ${dedupedSkipped.length} duplicate emails merged into the first occurrence
-- Run order: wipe → bulk insert.
-- Run from Neon SQL Editor as the owner role so RLS doesn't bite.
-- ============================================================

BEGIN;

-- 1. Resolve master org once.
WITH master AS (
  SELECT id
  FROM orgs
  WHERE clerk_org_id = 'org_3DE6hCoL4MJtDAxa5JCq20KxzgT'
  LIMIT 1
)
-- 2. Capture prospect ids we're about to wipe so we can null FKs first.
, prospect_ids AS (
  SELECT p.id
  FROM prospects p
  WHERE p.org_id = (SELECT id FROM master)
)
-- 3. Wipe activity log + client comms references first.
, _wipe_activities AS (
  DELETE FROM prospect_activities
  WHERE prospect_id IN (SELECT id FROM prospect_ids)
  RETURNING 1
)
, _wipe_comms AS (
  DELETE FROM client_communications
  WHERE prospect_id IN (SELECT id FROM prospect_ids)
  RETURNING 1
)
SELECT
  (SELECT COUNT(*) FROM _wipe_activities) AS wiped_activities,
  (SELECT COUNT(*) FROM _wipe_comms)      AS wiped_comms;

-- 4. Now delete the prospects themselves.
DELETE FROM prospects
WHERE org_id = (
  SELECT id FROM orgs WHERE clerk_org_id = 'org_3DE6hCoL4MJtDAxa5JCq20KxzgT'
);

-- 5. Bulk insert the migrated set.
INSERT INTO prospects (
  org_id,
  company_name,
  contact_name,
  contact_email,
  phone,
  lead_source,
  expected_value_cents,
  currency,
  next_action_date,
  last_contact_at,
  status,
  notes,
  created_at,
  updated_at
)
VALUES
${finalRows
  .map((r) => {
    return `  (
    (SELECT id FROM orgs WHERE clerk_org_id = 'org_3DE6hCoL4MJtDAxa5JCq20KxzgT'),
    ${q(r.company)},
    ${q(r.contactName)},
    ${q(r.contactEmail)},
    ${q(r.phone)},
    ${q(r.leadSource)},
    ${n(r.expectedValueCents)},
    'CAD',
    ${r.nextActionDate ? q(r.nextActionDate) : "NULL"},
    ${r.lastContactAt ? q(r.lastContactAt) : "NULL"},
    '${r.status}'::prospect_status,
    ${q(r.notes)},
    ${q(r.createdAt)},
    ${q(r.updatedAt)}
  )`;
  })
  .join(",\n")};

-- 6. Verify.
SELECT
  (SELECT COUNT(*) FROM prospects WHERE org_id = (SELECT id FROM orgs WHERE clerk_org_id = 'org_3DE6hCoL4MJtDAxa5JCq20KxzgT')) AS prospects_after,
  (SELECT status::text || ':' || COUNT(*)::text FROM prospects
    WHERE org_id = (SELECT id FROM orgs WHERE clerk_org_id = 'org_3DE6hCoL4MJtDAxa5JCq20KxzgT')
    GROUP BY status ORDER BY status LIMIT 1) AS sample_status_breakdown;

COMMIT;

-- Skipped items (for the record — left in Monday only):
${[...skipped, ...dedupedSkipped].map((s) => `--   - ${s.name} (${s.id}) — ${s.reason}`).join("\n")}
`;

fs.writeFileSync(OUT, sql, "utf8");

console.log(`Wrote ${OUT}`);
console.log(`Imported rows: ${finalRows.length}`);
console.log(`Skipped: ${skipped.length} blanks + ${dedupedSkipped.length} duplicates`);

// Stage distribution check
const dist = {};
for (const r of finalRows) dist[r.status] = (dist[r.status] || 0) + 1;
console.log("Status distribution:", dist);
