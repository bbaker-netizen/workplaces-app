"use server";

/**
 * One-time, exact correction for the 29 Facebook leads whose phone column
 * was corrupted by the earlier bad import (it grabbed the "Created"
 * date/time instead of the Phone column).
 *
 * The correct values below are transcribed verbatim from Bruce's leads
 * export — no file upload, no column-guessing. Matched by EMAIL, this
 * writes ONLY the phone number and sets lead source to "Facebook Ads".
 * It never touches names, emails, notes, stage, or anything else, and it
 * never creates new records — unmatched emails are only reported.
 */

import { eq } from "drizzle-orm";
import { orgs, prospects } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { ensureUserProfile } from "@/lib/db/provisioning";

const LEAD_SOURCE = "Facebook Ads";

/** email (lowercase) → correct display name + phone, from the leads sheet. */
const FACEBOOK_LEADS: { email: string; name: string; phone: string }[] = [
  { email: "ibimdipo@gmail.com", name: "Ibiwangi M Oladipo", phone: "(780) 607-0914" },
  { email: "sawsenkaudhai20@gmail.com", name: "Sawsen Kaudhai Alickovic", phone: "(787) 695-0787" },
  { email: "raylenventanilla@gmail.com", name: "James Leanard", phone: "(780) 604-7896" },
  { email: "amalaraveendran74@gmail.com", name: "Amala Raveendran", phone: "(587) 597-8111" },
  { email: "tdschool1@hotmail.com", name: "Ali Choudhry", phone: "(647) 712-1492" },
  { email: "truejoycleaning@gmail.com", name: "Karen Andrichuk", phone: "(780) 404-5275" },
  { email: "ronaldkellyvalera@gmail.com", name: "Ron Valera", phone: "(778) 256-6768" },
  { email: "olatunde.chris@gmail.com", name: "Olatunde Chris Bamisile", phone: "(438) 863-2528" },
  { email: "maui2671@gmail.com", name: "Terry M", phone: "(780) 999-6450" },
  { email: "bulaklak564@gmail.com", name: "Echapre Villa", phone: "(587) 975-3780" },
  { email: "wipf5683@gmail.com", name: "RaeAnn Wipf", phone: "(403) 376-0972" },
  { email: "dolphioninternational1974@gmail.com", name: "Eyassu Habtemaryam Gebrmikel", phone: "(403) 510-7848" },
  { email: "bluejaysdrive@gmail.com", name: "Bluejays highering drive service", phone: "(647) 502-4394" },
  { email: "t_schram@hotmail.com", name: "Trevor Schram", phone: "(780) 862-7297" },
  { email: "realestatealbertacanada@gmail.com", name: "Grey Joon", phone: "(780) 802-2625" },
  { email: "merastykenny6@gmail.com", name: "Kenneth Merasty", phone: "(587) 434-8349" },
  { email: "quabous16@gmail.com", name: "Abdellatif Quabous Elabdi", phone: "(780) 977-0184" },
  { email: "jhairamae.humber@gmail.com", name: "Jhaira Mae Humber", phone: "(780) 996-2032" },
  { email: "tracymcmaster8808@gmail.com", name: "Tracy Dawn McMaster Pahl", phone: "(403) 436-0433" },
  { email: "uniquelylinked@shaw.ca", name: "Dar", phone: "(780) 965-9639" },
  { email: "hiddenfloorphotography@gmail.com", name: "Jordon Deagle", phone: "(639) 560-0711" },
  { email: "kmroman02@hotmail.com", name: "Kelly Romanchuk", phone: "(780) 876-6642" },
  { email: "arstarrocks@gmail.com", name: "Arlene Yknee", phone: "(403) 402-4706" },
  { email: "izabelaw@telus.net", name: "Izabela Wietrzyk", phone: "(780) 729-2994" },
  { email: "troy.avramenko@icloud.com", name: "Troy Avramenko", phone: "(403) 466-6984" },
  { email: "calso368@outlook.com", name: "Abby Calso", phone: "(587) 532-7199" },
  { email: "jcmmechanical@outlook.com", name: "Joseph Cinq-Mars", phone: "(780) 573-4952" },
  { email: "arukebesha@gmail.com", name: "Antoine Rukebesha", phone: "(250) 884-3011" },
  { email: "mbrick@telus.net", name: "Michelle", phone: "(780) 402-1739" },
];

export type LeadFixRow = {
  email: string;
  name: string;
  newPhone: string;
  found: boolean;
  /** How the app record was located: by email, by unique name, or not at all. */
  matchedBy: "email" | "name" | "none";
  company: string | null;
  currentPhone: string | null;
  currentSource: string | null;
  phoneChanges: boolean;
  sourceChanges: boolean;
};

/** Normalise a name for matching: trim, lowercase, collapse whitespace. */
function normName(s: string | null): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** A phone value we're safe to overwrite on a name match: empty, or the
 *  date/time junk the earlier bad import wrote. Never clobbers a value that
 *  already looks like a real phone number. */
function isEmptyOrJunkPhone(phone: string | null): boolean {
  const t = (phone ?? "").trim();
  if (!t) return true;
  if (/\d{4}-\d{1,2}-\d{1,2}/.test(t)) return true; // ISO date
  if (/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(t)) return true; // slash date
  if (/\d{1,2}:\d{2}/.test(t)) return true; // time
  if (/[A-Za-z]{2,}/.test(t)) return true; // words (e.g. "9:09am")
  return false;
}

export type LeadFixResult =
  | {
      ok: true;
      applied: boolean;
      rows: LeadFixRow[];
      matched: number;
      notFound: number;
      phonesFixed: number;
      sourcesFixed: number;
    }
  | { ok: false; error: string };

async function run(apply: boolean): Promise<LeadFixResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not signed in." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Business Builders only." };
  }
  try {
    return await withSystemContext(async (tx): Promise<LeadFixResult> => {
      const [master] = await tx
        .select({ id: orgs.id })
        .from(orgs)
        .where(eq(orgs.type, "master"))
        .limit(1);
      if (!master) return { ok: false, error: "Master org isn't configured." };

      // Pull every prospect in the master org once, then match in memory —
      // by email first, then by a UNIQUE name as a fallback (some leads have
      // no email on their record, so email-only matching missed them).
      const all = await tx
        .select({
          id: prospects.id,
          company: prospects.companyName,
          contactName: prospects.contactName,
          email: prospects.contactEmail,
          phone: prospects.phone,
          leadSource: prospects.leadSource,
        })
        .from(prospects)
        .where(eq(prospects.orgId, master.id));

      type Row = (typeof all)[number];
      const byEmail = new Map<string, Row>();
      const byName = new Map<string, Row[]>();
      for (const p of all) {
        const e = (p.email ?? "").trim().toLowerCase();
        if (e && !byEmail.has(e)) byEmail.set(e, p);
        for (const nm of [p.contactName, p.company]) {
          const n = normName(nm);
          if (!n) continue;
          const list = byName.get(n) ?? [];
          if (!list.includes(p)) list.push(p);
          byName.set(n, list);
        }
      }

      const rows: LeadFixRow[] = [];
      let phonesFixed = 0;
      let sourcesFixed = 0;
      let matched = 0;

      for (const lead of FACEBOOK_LEADS) {
        let existing: Row | undefined = byEmail.get(lead.email);
        let matchedBy: LeadFixRow["matchedBy"] = existing ? "email" : "none";
        if (!existing) {
          // Fall back to name — only if EXACTLY one prospect carries it, so
          // we never guess between two people with the same name.
          const candidates = byName.get(normName(lead.name)) ?? [];
          if (candidates.length === 1) {
            existing = candidates[0];
            matchedBy = "name";
          }
        }

        if (!existing) {
          rows.push({
            email: lead.email,
            name: lead.name,
            newPhone: lead.phone,
            found: false,
            matchedBy: "none",
            company: null,
            currentPhone: null,
            currentSource: null,
            phoneChanges: false,
            sourceChanges: false,
          });
          continue;
        }

        matched++;
        // Email match: trust it, overwrite the phone. Name match: only fill
        // when the current phone is empty or junk, never over a real number.
        const canSetPhone =
          matchedBy === "email" || isEmptyOrJunkPhone(existing.phone);
        const phoneChanges =
          canSetPhone && (existing.phone ?? "") !== lead.phone;
        const sourceChanges = (existing.leadSource ?? "") !== LEAD_SOURCE;
        if (phoneChanges) phonesFixed++;
        if (sourceChanges) sourcesFixed++;

        rows.push({
          email: lead.email,
          name: lead.name,
          newPhone: lead.phone,
          found: true,
          matchedBy,
          company: existing.company,
          currentPhone: existing.phone,
          currentSource: existing.leadSource,
          phoneChanges,
          sourceChanges,
        });

        // Only ever writes phone and/or lead source — nothing else.
        if (apply && (phoneChanges || sourceChanges)) {
          const patch: { phone?: string; leadSource?: string } = {};
          if (phoneChanges) patch.phone = lead.phone;
          if (sourceChanges) patch.leadSource = LEAD_SOURCE;
          await tx.update(prospects).set(patch).where(eq(prospects.id, existing.id));
        }
      }

      return {
        ok: true,
        applied: apply,
        rows,
        matched,
        notFound: FACEBOOK_LEADS.length - matched,
        phonesFixed,
        sourcesFixed,
      };
    });
  } catch (e) {
    return {
      ok: false,
      error: (e instanceof Error ? e.message : "Fix failed.").slice(0, 200),
    };
  }
}

export async function previewFacebookLeadFixes(): Promise<LeadFixResult> {
  return run(false);
}

export async function applyFacebookLeadFixes(): Promise<LeadFixResult> {
  return run(true);
}
