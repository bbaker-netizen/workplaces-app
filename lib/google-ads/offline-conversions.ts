/**
 * Push booked/signed sessions back to Google Ads as offline conversions, so its
 * bidding can optimize for booked sessions instead of the cheapest form fill.
 *
 * Mechanism: an idempotent SWEEP (not an inline hook). A prospect reaches the
 * booked/signed stage through several paths — the pipeline UI (updateProspect),
 * the calendar-booking webhook (/api/leads), and native signing — so a sweep
 * that scans for "has a gclid, is at/past this stage, not yet uploaded" catches
 * every path with one code path and is naturally idempotent + retry-friendly.
 *
 * Idempotency (never upload the same (gclid, action) twice):
 *   - a per-kind watermark column on the prospect
 *     (google_booked_conversion_uploaded_at / google_signed_conversion_uploaded_at)
 *   - the sweep selects only rows where that column IS NULL
 *   - the column is stamped only after a confirmed successful upload
 *   - Google also rejects duplicates, but we do not rely on that.
 *
 * Degrades safely: unset credentials → a logged no-op, never a throw. Failures
 * are logged verbatim and left for the next sweep (the watermark stays NULL).
 * ERP build spec 2026-07-13, item 6.
 */

import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { DateTime } from "luxon";
import { orgs, prospects } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import {
  GOOGLE_ADS_ENV_VARS,
  googleAdsConfig,
  type GoogleAdsConfig,
} from "@/lib/google-ads/config";
import { uploadClickConversion } from "@/lib/google-ads/client";
import type { ProspectStatus } from "@/lib/pipeline/stages";

const TZ = "America/Edmonton";

export type ConversionKind = "booked" | "signed";

// A booked session is anything at or past "Appt booked"; signed is
// contract_signed or the won state beyond it. (lost/not_qualified excluded.)
const BOOKED_STATUSES: ProspectStatus[] = [
  "meeting_scheduled",
  "appt_completed_followup",
  "proposal_sent",
  "contract_sent",
  "contract_signed",
  "onboarded",
];
const SIGNED_STATUSES: ProspectStatus[] = ["contract_signed", "onboarded"];

interface KindDef {
  label: string;
  action: (cfg: GoogleAdsConfig) => string | null;
  statuses: ProspectStatus[];
  /** Which timestamp best represents when the conversion happened. */
  timeOf: (p: ProspectRow) => Date | null;
}

const KINDS: Record<ConversionKind, KindDef> = {
  booked: {
    label: "Booked session",
    action: (cfg) => cfg.bookedConversionAction,
    statuses: BOOKED_STATUSES,
    timeOf: (p) => p.bookedSessionAt,
  },
  signed: {
    label: "Client signed",
    action: (cfg) => cfg.signedConversionAction,
    statuses: SIGNED_STATUSES,
    timeOf: (p) => p.contractSignedAt,
  },
};

interface ProspectRow {
  id: string;
  gclid: string | null;
  expectedValueCents: number | null;
  currency: string;
  bookedSessionAt: Date | null;
  contractSignedAt: Date | null;
  updatedAt: Date;
}

export interface ConversionSyncSummary {
  configured: boolean;
  skippedReason?: string;
  booked: { eligible: number; uploaded: number; failed: number; skipped: number };
  signed: { eligible: number; uploaded: number; failed: number; skipped: number };
}

function emptyResult(): ConversionSyncSummary["booked"] {
  return { eligible: 0, uploaded: 0, failed: 0, skipped: 0 };
}

/** Google wants "yyyy-MM-dd HH:mm:ss+HH:mm" in a real time zone. */
function conversionDateTime(at: Date): string {
  return DateTime.fromJSDate(at).setZone(TZ).toFormat("yyyy-MM-dd HH:mm:ssZZ");
}

async function stampUploaded(
  kind: ConversionKind,
  prospectId: string,
  at: Date,
): Promise<void> {
  await withSystemContext(async (tx) => {
    await tx
      .update(prospects)
      .set(
        kind === "booked"
          ? { googleBookedConversionUploadedAt: at }
          : { googleSignedConversionUploadedAt: at },
      )
      .where(eq(prospects.id, prospectId));
  });
}

async function eligibleProspects(
  masterOrgId: string,
  kind: ConversionKind,
): Promise<ProspectRow[]> {
  const uploadedCol =
    kind === "booked"
      ? prospects.googleBookedConversionUploadedAt
      : prospects.googleSignedConversionUploadedAt;
  return withSystemContext(async (tx) =>
    tx
      .select({
        id: prospects.id,
        gclid: prospects.gclid,
        expectedValueCents: prospects.expectedValueCents,
        currency: prospects.currency,
        bookedSessionAt: prospects.bookedSessionAt,
        contractSignedAt: prospects.contractSignedAt,
        updatedAt: prospects.updatedAt,
      })
      .from(prospects)
      .where(
        and(
          eq(prospects.orgId, masterOrgId),
          isNotNull(prospects.gclid),
          isNull(uploadedCol),
          inArray(prospects.status, KINDS[kind].statuses),
        ),
      ),
  );
}

async function runKind(
  cfg: GoogleAdsConfig,
  masterOrgId: string,
  kind: ConversionKind,
  now: Date,
): Promise<ConversionSyncSummary["booked"]> {
  const out = emptyResult();
  const action = KINDS[kind].action(cfg);
  if (!action) {
    console.warn(
      `[google-ads] ${kind} conversion action not configured (set GOOGLE_ADS_${kind.toUpperCase()}_CONVERSION_ACTION); skipping.`,
    );
    return out;
  }

  const rows = await eligibleProspects(masterOrgId, kind);
  out.eligible = rows.length;

  for (const p of rows) {
    const gclid = (p.gclid ?? "").trim();
    if (!gclid) {
      out.skipped += 1; // shouldn't happen (WHERE isNotNull) — belt & braces
      continue;
    }
    const at = KINDS[kind].timeOf(p) ?? p.updatedAt ?? now;
    const value =
      typeof p.expectedValueCents === "number" && p.expectedValueCents > 0
        ? p.expectedValueCents / 100
        : undefined;

    const result = await uploadClickConversion(cfg, {
      gclid,
      conversionAction: action,
      conversionDateTime: conversionDateTime(at),
      value,
      currencyCode: p.currency || "CAD",
    });

    if (result.ok) {
      await stampUploaded(kind, p.id, now);
      out.uploaded += 1;
      console.log(
        `[google-ads] uploaded ${kind} conversion for prospect ${p.id} (gclid ${gclid.slice(0, 12)}…).`,
      );
    } else {
      out.failed += 1;
      // Verbatim Google response — never swallowed. Watermark stays NULL so the
      // next sweep retries.
      console.error(
        `[google-ads] ${kind} upload FAILED for prospect ${p.id} (HTTP ${result.status}): ${result.body}`,
      );
    }
  }

  return out;
}

/**
 * The sweep. Safe to call on a schedule and safe to call twice — the watermark
 * columns make it idempotent. Never throws into the caller.
 */
export async function runGoogleAdsConversionSync(
  now: Date = new Date(),
): Promise<ConversionSyncSummary> {
  const cfg = googleAdsConfig();
  if (!cfg) {
    const msg = `Google Ads not configured — set: ${GOOGLE_ADS_ENV_VARS.join(", ")}.`;
    console.warn(`[google-ads] ${msg} Skipping conversion sync.`);
    return {
      configured: false,
      skippedReason: msg,
      booked: emptyResult(),
      signed: emptyResult(),
    };
  }

  try {
    const masterOrgId = await withSystemContext(async (tx) => {
      const [master] = await tx
        .select({ id: orgs.id })
        .from(orgs)
        .where(eq(orgs.type, "master"))
        .limit(1);
      return master?.id ?? null;
    });
    if (!masterOrgId) {
      return {
        configured: true,
        skippedReason: "No master org found.",
        booked: emptyResult(),
        signed: emptyResult(),
      };
    }

    const booked = await runKind(cfg, masterOrgId, "booked", now);
    const signed = await runKind(cfg, masterOrgId, "signed", now);
    return { configured: true, booked, signed };
  } catch (e) {
    // Never let a conversion-sync error escape — it must not affect anything else.
    console.error("[google-ads] conversion sync crashed:", e);
    return {
      configured: true,
      skippedReason: e instanceof Error ? e.message : String(e),
      booked: emptyResult(),
      signed: emptyResult(),
    };
  }
}
