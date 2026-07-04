"use server";

/**
 * Bulk lead reconcile/import. Paste rows (name, email, phone — from a CSV or
 * straight out of a spreadsheet). Matches existing prospects by email and
 * fills in ONLY missing fields (phone, contact name) — it never overwrites
 * an existing value and never touches notes, stage, source, or anything the
 * coach has set. Unmatched emails become new Facebook-Ads leads.
 *
 * Two-pass: call with apply=false for a safe preview, then apply=true to
 * write.
 */

import { and, eq, sql } from "drizzle-orm";
import { orgs, prospects } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { formatPhone } from "@/lib/format";

type Row = { name: string | null; email: string; phone: string | null };

export type ImportResult =
  | {
      ok: true;
      applied: boolean;
      parsed: number;
      phonesFilled: number;
      namesFilled: number;
      newLeads: number;
      alreadyComplete: number;
      notes: string[];
    }
  | { ok: false; error: string };

const emailRe = /[^\s,;"]+@[^\s,;"]+\.[^\s,;"]+/;

/**
 * Whether a cell looks like a date or time rather than data we want.
 * Dates are the classic false-positive for phone detection — "2026-07-03"
 * is eight digits, which used to slip through the old "7+ digits = phone"
 * rule and land in the phone column. Anything matching here is never
 * treated as a phone (or a name).
 */
function isDateOrTimeLike(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (/\d{4}-\d{1,2}-\d{1,2}/.test(t)) return true; // 2026-07-03 (ISO)
  if (/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(t)) return true; // 07/03/2026
  if (/\d{1,2}:\d{2}/.test(t)) return true; // 14:30 time
  if (/\bT\d{2}:\d{2}/.test(t)) return true; // ISO 2026-07-03T14:30
  if (/\b(AM|PM|GMT|UTC)\b/i.test(t)) return true; // 2:30 PM / GMT
  if (
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b/i.test(t) &&
    /\d/.test(t)
  ) {
    return true; // "Jul 3, 2026"
  }
  return false;
}

/**
 * A real phone number: 7–15 digits (local through E.164), and NOT a date
 * or time. Longer digit runs (serials, concatenated timestamps) and any
 * date/time string are rejected.
 */
function looksLikePhone(s: string): boolean {
  if (isDateOrTimeLike(s)) return false;
  const digits = s.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

function parseRows(text: string): Row[] {
  const rows: Row[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    // Tab (pasted from a sheet) or comma separated.
    const cells = line
      .split(line.includes("\t") ? "\t" : ",")
      .map((c) => c.trim().replace(/^"|"$/g, ""));
    const emailCell = cells.find((c) => emailRe.test(c));
    if (!emailCell) continue; // header row / junk
    const email = (emailRe.exec(emailCell)?.[0] ?? "").toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    const phoneCell = cells.find(
      (c) => c !== emailCell && looksLikePhone(c),
    );
    const name =
      cells.find(
        (c) =>
          c !== emailCell &&
          c !== phoneCell &&
          /[a-zA-Z]{2,}/.test(c) &&
          !emailRe.test(c) &&
          !isDateOrTimeLike(c),
      ) ?? null;
    rows.push({
      name: name?.slice(0, 200) ?? null,
      email,
      phone: phoneCell ? formatPhone(phoneCell) : null,
    });
  }
  return rows;
}

export async function importLeads(
  text: string,
  apply: boolean,
): Promise<ImportResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not signed in." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Business Builders only." };
  }
  const rows = parseRows(text ?? "");
  if (rows.length === 0) {
    return { ok: false, error: "No rows with an email found. Paste rows that include an email column." };
  }

  try {
    return await withSystemContext(async (tx): Promise<ImportResult> => {
      const [master] = await tx
        .select({ id: orgs.id })
        .from(orgs)
        .where(eq(orgs.type, "master"))
        .limit(1);
      if (!master) return { ok: false, error: "Master org isn't configured." };

      let phonesFilled = 0;
      let namesFilled = 0;
      let newLeads = 0;
      let alreadyComplete = 0;
      const notes: string[] = [];

      for (const row of rows) {
        const [existing] = await tx
          .select({
            id: prospects.id,
            phone: prospects.phone,
            contactName: prospects.contactName,
            companyName: prospects.companyName,
          })
          .from(prospects)
          .where(
            and(
              eq(prospects.orgId, master.id),
              sql`lower(${prospects.contactEmail}) = ${row.email}`,
            ),
          )
          .limit(1);

        if (existing) {
          const patch: { phone?: string; contactName?: string } = {};
          if (row.phone && !(existing.phone && existing.phone.trim())) {
            patch.phone = row.phone;
            phonesFilled++;
          }
          if (row.name && !(existing.contactName && existing.contactName.trim())) {
            patch.contactName = row.name;
            namesFilled++;
          }
          if (Object.keys(patch).length === 0) {
            alreadyComplete++;
          } else {
            notes.push(
              `${existing.companyName}: ${[
                patch.phone ? "phone" : null,
                patch.contactName ? "name" : null,
              ]
                .filter(Boolean)
                .join(" + ")}`,
            );
            if (apply) {
              await tx
                .update(prospects)
                .set(patch)
                .where(eq(prospects.id, existing.id));
            }
          }
        } else {
          newLeads++;
          notes.push(`NEW: ${row.name ?? row.email}`);
          if (apply) {
            await tx.insert(prospects).values({
              orgId: master.id,
              companyName: (row.name ?? row.email).slice(0, 200),
              contactName: row.name,
              contactEmail: row.email,
              phone: row.phone ?? undefined,
              leadSource: "Facebook Ads",
              status: "new_lead",
            });
          }
        }
      }

      return {
        ok: true,
        applied: apply,
        parsed: rows.length,
        phonesFilled,
        namesFilled,
        newLeads,
        alreadyComplete,
        notes: notes.slice(0, 60),
      };
    });
  } catch (e) {
    return {
      ok: false,
      error: (e instanceof Error ? e.message : "Import failed.").slice(0, 200),
    };
  }
}

export type PhoneCleanupResult =
  | {
      ok: true;
      applied: boolean;
      cleared: number;
      samples: { company: string; badPhone: string }[];
    }
  | { ok: false; error: string };

/** A stored phone value is junk if it's really a date/time or otherwise
 *  contains words — the exact damage an earlier import bug could write into
 *  the phone column. Real phone numbers never match this. */
function isJunkPhone(phone: string): boolean {
  return isDateOrTimeLike(phone) || /[A-Za-z]{2,}/.test(phone);
}

/**
 * Repair pass for the phone column: finds prospects whose phone value is
 * actually a date/time (or other non-phone text) and clears it back to
 * empty. Never touches a legitimate phone number, and never touches notes
 * or any other field. Preview first (apply=false), then apply=true.
 */
export async function cleanupImportedPhones(
  apply: boolean,
): Promise<PhoneCleanupResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not signed in." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Business Builders only." };
  }
  try {
    return await withSystemContext(async (tx): Promise<PhoneCleanupResult> => {
      const [master] = await tx
        .select({ id: orgs.id })
        .from(orgs)
        .where(eq(orgs.type, "master"))
        .limit(1);
      if (!master) return { ok: false, error: "Master org isn't configured." };

      const rows = await tx
        .select({
          id: prospects.id,
          phone: prospects.phone,
          companyName: prospects.companyName,
        })
        .from(prospects)
        .where(eq(prospects.orgId, master.id));

      const bad = rows.filter(
        (r) => r.phone && r.phone.trim() && isJunkPhone(r.phone),
      );
      const samples = bad
        .slice(0, 60)
        .map((r) => ({ company: r.companyName, badPhone: r.phone ?? "" }));

      if (apply) {
        for (const r of bad) {
          await tx
            .update(prospects)
            .set({ phone: null })
            .where(eq(prospects.id, r.id));
        }
      }

      return { ok: true, applied: apply, cleared: bad.length, samples };
    });
  } catch (e) {
    return {
      ok: false,
      error: (e instanceof Error ? e.message : "Cleanup failed.").slice(0, 200),
    };
  }
}
