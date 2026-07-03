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
      (c) => c !== emailCell && c.replace(/\D/g, "").length >= 7,
    );
    const name =
      cells.find(
        (c) =>
          c !== emailCell &&
          c !== phoneCell &&
          /[a-zA-Z]{2,}/.test(c) &&
          !emailRe.test(c),
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
