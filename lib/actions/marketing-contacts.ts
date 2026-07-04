"use server";

/**
 * Marketing-list import + management.
 *
 * Imports a CSV export (first use: WordPress / Formidable entries) into the
 * `marketing_contacts` table — a list kept separate from the sales pipeline
 * so it never touches pipeline metrics. De-dupes by email against the list
 * itself, and links any contact whose email already exists as a prospect so
 * the UI can flag "already in your pipeline."
 *
 * Two-step like the Facebook fix tool: preview (no writes) → apply.
 * Business Builders only. Everything runs in the master org.
 */

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { marketingContacts, orgs, prospects } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { formatPhone } from "@/lib/format";
import {
  isImportableEmail,
  parseMarketingCsv,
  type ParsedRow,
} from "@/lib/marketing/csv";
import {
  looksLikeFormidableXml,
  parseFormidableXml,
} from "@/lib/marketing/formidable";

type NormalizedParse = {
  format: "csv" | "formidable-xml";
  rows: ParsedRow[];
  headers: string[];
  mapping: {
    name: string | null;
    email: string | null;
    phone: string | null;
    company: string | null;
  };
};

/** Parse either a Formidable XML export or a CSV into the same row shape. */
function parseImport(text: string): NormalizedParse {
  if (looksLikeFormidableXml(text)) {
    const rows = parseFormidableXml(text);
    return {
      format: "formidable-xml",
      rows,
      headers: [],
      mapping: {
        name: "Formidable name",
        // We only surface a mapping label; XML detection is by value.
        email: rows.some((r) => r.email) ? "auto-detected" : null,
        phone: rows.some((r) => r.phone) ? "auto-detected" : null,
        company: null,
      },
    };
  }
  const csv = parseMarketingCsv(text);
  return {
    format: "csv",
    rows: csv.rows,
    headers: csv.headers,
    mapping: csv.mapping,
  };
}

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type ImportSummary = {
  totalRows: number;
  mapping: {
    name: string | null;
    email: string | null;
    phone: string | null;
    company: string | null;
  };
  invalidEmail: number;
  duplicatesInFile: number;
  alreadyInList: number;
  toAdd: number;
  toAddMatchingProspect: number;
  /** First few contacts that would be added, for a quick eyeball. */
  sample: { name: string | null; email: string; phone: string | null }[];
  applied: boolean;
  added: number;
};

const csvSchema = z.object({
  csv: z.string().min(1, "Paste or upload a CSV first.").max(15_000_000),
  source: z.string().trim().max(60).optional(),
});

async function classify(csv: string) {
  const parsed = parseImport(csv);

  const master = await withSystemContext(async (tx) => {
    const [m] = await tx
      .select({ id: orgs.id })
      .from(orgs)
      .where(eq(orgs.type, "master"))
      .limit(1);
    return m ?? null;
  });
  if (!master) throw new Error("Master org not found.");

  // Existing marketing emails + prospect email → id map, one pass each.
  const { marketingEmails, prospectIdByEmail } = await withSystemContext(
    async (tx) => {
      const mkt = await tx
        .select({ email: marketingContacts.email })
        .from(marketingContacts)
        .where(eq(marketingContacts.orgId, master.id));
      const pros = await tx
        .select({ id: prospects.id, email: prospects.contactEmail })
        .from(prospects)
        .where(eq(prospects.orgId, master.id));
      const marketingEmails = new Set(
        mkt.map((r) => r.email.trim().toLowerCase()),
      );
      const prospectIdByEmail = new Map<string, string>();
      for (const p of pros) {
        if (p.email) prospectIdByEmail.set(p.email.trim().toLowerCase(), p.id);
      }
      return { marketingEmails, prospectIdByEmail };
    },
  );

  let invalidEmail = 0;
  let duplicatesInFile = 0;
  let alreadyInList = 0;
  const seen = new Set<string>();
  const toAdd: (ParsedRow & { email: string; matchedProspectId: string | null })[] =
    [];

  for (const row of parsed.rows) {
    if (!isImportableEmail(row.email)) {
      invalidEmail++;
      continue;
    }
    const email = row.email; // already lowercased by the parser
    if (seen.has(email)) {
      duplicatesInFile++;
      continue;
    }
    seen.add(email);
    if (marketingEmails.has(email)) {
      alreadyInList++;
      continue;
    }
    toAdd.push({
      ...row,
      email,
      matchedProspectId: prospectIdByEmail.get(email) ?? null,
    });
  }

  return { master, parsed, invalidEmail, duplicatesInFile, alreadyInList, toAdd };
}

export async function previewMarketingImport(
  input: z.input<typeof csvSchema>,
): Promise<ActionResult<ImportSummary>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };

  const p = csvSchema.safeParse(input);
  if (!p.success)
    return { ok: false, error: p.error.issues[0]?.message ?? "Invalid input" };

  try {
    const { parsed, invalidEmail, duplicatesInFile, alreadyInList, toAdd } =
      await classify(p.data.csv);
    if (!parsed.mapping.email) {
      return {
        ok: false,
        error:
          parsed.format === "formidable-xml"
            ? "No email addresses found in that Formidable XML export. Make sure the form has an email field."
            : `Couldn't find an email column. Columns found: ${parsed.headers.join(", ") || "(none)"}. Make sure the export has an Email column.`,
      };
    }
    return {
      ok: true,
      data: {
        totalRows: parsed.rows.length,
        mapping: parsed.mapping,
        invalidEmail,
        duplicatesInFile,
        alreadyInList,
        toAdd: toAdd.length,
        toAddMatchingProspect: toAdd.filter((r) => r.matchedProspectId).length,
        sample: toAdd.slice(0, 8).map((r) => ({
          name: r.name,
          email: r.email,
          phone: r.phone,
        })),
        applied: false,
        added: 0,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function importMarketingContacts(
  input: z.input<typeof csvSchema>,
): Promise<ActionResult<ImportSummary>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };

  const p = csvSchema.safeParse(input);
  if (!p.success)
    return { ok: false, error: p.error.issues[0]?.message ?? "Invalid input" };

  try {
    const { master, parsed, invalidEmail, duplicatesInFile, alreadyInList, toAdd } =
      await classify(p.data.csv);
    if (!parsed.mapping.email) {
      return {
        ok: false,
        error:
          parsed.format === "formidable-xml"
            ? "No email addresses found in that Formidable XML export."
            : `Couldn't find an email column. Columns found: ${parsed.headers.join(", ") || "(none)"}.`,
      };
    }

    const source = p.data.source?.trim() || "WordPress";
    let added = 0;
    if (toAdd.length > 0) {
      // Insert in batches; ON CONFLICT DO NOTHING guards against the unique
      // (org, lower(email)) index if two rows race or slipped past the set.
      const CHUNK = 500;
      await withSystemContext(async (tx) => {
        for (let i = 0; i < toAdd.length; i += CHUNK) {
          const slice = toAdd.slice(i, i + CHUNK);
          const res = await tx
            .insert(marketingContacts)
            .values(
              slice.map((r) => ({
                orgId: master.id,
                name: r.name,
                email: r.email,
                phone: r.phone,
                company: r.company,
                source,
                matchedProspectId: r.matchedProspectId,
                createdByUserProfileId: profile.userProfileId,
              })),
            )
            .onConflictDoNothing()
            .returning({ id: marketingContacts.id });
          added += res.length;
        }
      });
    }

    revalidatePath("/business-builder/marketing");
    return {
      ok: true,
      data: {
        totalRows: parsed.rows.length,
        mapping: parsed.mapping,
        invalidEmail,
        duplicatesInFile,
        alreadyInList,
        toAdd: toAdd.length,
        toAddMatchingProspect: toAdd.filter((r) => r.matchedProspectId).length,
        sample: [],
        applied: true,
        added,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const deleteSchema = z.object({ id: z.string().uuid() });

export async function deleteMarketingContact(
  input: z.input<typeof deleteSchema>,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };
  const p = deleteSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid id." };

  await withSystemContext((tx) =>
    tx.delete(marketingContacts).where(eq(marketingContacts.id, p.data.id)),
  );
  revalidatePath("/business-builder/marketing");
  return { ok: true, data: undefined };
}

const promoteSchema = z.object({ id: z.string().uuid() });

/**
 * Promote a marketing contact into the sales pipeline as a real prospect.
 * If a prospect with the same email already exists we link to it instead of
 * creating a duplicate. The marketing contact stays on the list, flagged
 * "in pipeline," so nothing is lost.
 */
export async function promoteMarketingContact(
  input: z.input<typeof promoteSchema>,
): Promise<ActionResult<{ prospectId: string; alreadyExisted: boolean }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };
  const p = promoteSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid id." };

  try {
    const result = await withSystemContext(async (tx) => {
      const [master] = await tx
        .select({ id: orgs.id })
        .from(orgs)
        .where(eq(orgs.type, "master"))
        .limit(1);
      if (!master) throw new Error("Master org not configured.");

      const [c] = await tx
        .select()
        .from(marketingContacts)
        .where(
          and(
            eq(marketingContacts.id, p.data.id),
            eq(marketingContacts.orgId, master.id),
          ),
        )
        .limit(1);
      if (!c) throw new Error("Contact not found.");

      const email = c.email.trim().toLowerCase();

      // Don't create a duplicate — reuse an existing prospect with this email.
      const [existing] = await tx
        .select({ id: prospects.id })
        .from(prospects)
        .where(
          and(
            eq(prospects.orgId, master.id),
            eq(prospects.contactEmail, email),
          ),
        )
        .limit(1);

      let prospectId: string;
      let alreadyExisted: boolean;
      if (existing) {
        prospectId = existing.id;
        alreadyExisted = true;
      } else {
        // companyName is required; fall back to the person's name, then the
        // email's local part, so the prospect always has a readable label.
        const companyName =
          c.company?.trim() ||
          c.name?.trim() ||
          email.split("@")[0] ||
          "New lead";
        const [row] = await tx
          .insert(prospects)
          .values({
            orgId: master.id,
            companyName,
            contactName: c.name?.trim() || null,
            contactEmail: email,
            phone: c.phone ? formatPhone(c.phone) : null,
            leadSource: c.source || "WordPress",
            notes: c.notes ?? null,
            ownerUserProfileId: profile.userProfileId,
            status: "new_lead",
          })
          .returning({ id: prospects.id });
        prospectId = row.id;
        alreadyExisted = false;
      }

      // Flag the marketing contact so the list shows it's in the pipeline.
      await tx
        .update(marketingContacts)
        .set({ matchedProspectId: prospectId })
        .where(eq(marketingContacts.id, c.id));

      return { prospectId, alreadyExisted };
    });

    revalidatePath("/business-builder/marketing");
    revalidatePath("/business-builder/pipeline");
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
