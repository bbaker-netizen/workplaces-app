/**
 * Lead-source attribution — the single source of truth for the
 * normalized acquisition channel of a prospect.
 *
 * The pipeline has always carried a free-text `leadSource` label
 * (LEAD_SOURCES in ./stages), which is human-facing and drives the
 * referral gift-cert logic. This module adds the CANONICAL, machine-
 * comparable `source` channel — a fixed enum stored on every prospect
 * and enforced NOT NULL at the DB level, so no lead can land untagged.
 *
 * First-touch attribution: `source` reflects how a prospect FIRST
 * reached us and is never overwritten once set. `sourceDetail` holds
 * the granular provenance (utm_campaign, which podcast, referrer note).
 *
 * Why a second field instead of replacing leadSource: leadSource is
 * referenced across the pipeline UI, the referral rule, and the older
 * Reports breakdown. We extend rather than rip it out; leadSource stays
 * the display label, `source` becomes the attribution key the spend
 * report is built on.
 */

/** The fixed acquisition channels. Order = report display order. */
export const LEAD_SOURCE_CHANNELS = [
  "google_ads",
  "meta",
  "organic_search",
  "direct",
  "referral",
  "podcast",
  "linkedin",
  "cold_inbound",
  "other",
] as const;

export type LeadSourceChannel = (typeof LEAD_SOURCE_CHANNELS)[number];

/** Human labels for dropdowns, the report, and the spend entry form. */
export const LEAD_SOURCE_LABELS: Record<LeadSourceChannel, string> = {
  google_ads: "Google Ads",
  meta: "Meta (Facebook / Instagram)",
  organic_search: "Organic search",
  direct: "Direct",
  referral: "Referral",
  podcast: "Podcast",
  linkedin: "LinkedIn",
  cold_inbound: "Cold inbound",
  other: "Other",
};

/** Channels a paid-media spend figure can meaningfully apply to. The
 *  spend-entry UI offers all channels, but these are the ones the report
 *  expects a number for; the rest show a dash for cost columns. */
export const PAID_CHANNELS: LeadSourceChannel[] = [
  "google_ads",
  "meta",
  "linkedin",
  "podcast",
];

export function isLeadSourceChannel(v: unknown): v is LeadSourceChannel {
  return (
    typeof v === "string" &&
    (LEAD_SOURCE_CHANNELS as readonly string[]).includes(v)
  );
}

/**
 * Deterministically relabel an existing free-text `leadSource` to a
 * channel. Used ONLY for the one-time backfill and as a fallback when a
 * legacy path writes a known verbatim label. This is a 1:1 relabel of
 * tags the system itself wrote — NOT a guess. Anything not unambiguously
 * mappable returns `other`, never a guessed channel.
 */
export function channelFromLegacyLeadSource(
  leadSource: string | null | undefined,
): LeadSourceChannel {
  const s = (leadSource ?? "").trim().toLowerCase();
  if (!s) return "other";
  if (s === "facebook ads") return "meta";
  if (s === "google ads campaign") return "google_ads";
  if (s === "google search") return "organic_search";
  if (s === "referral") return "referral";
  if (s === "linkedin") return "linkedin";
  // Website Form, Web form, Diagnostic, Discovery booking, Repeat Client,
  // Networking event, Conference, Social media, Webhook → unknown channel.
  return "other";
}

/**
 * Best-effort channel from a webhook payload (Meta / Google / etc.
 * bridged through Make.com, or a website form posting utm params). Reads
 * the same generous set of keys the /api/leads/[token] route already
 * picks. Falls back to `other` — never a guess.
 */
export function channelFromWebhookPayload(fields: {
  source?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
}): LeadSourceChannel {
  const src = (fields.source ?? fields.utmSource ?? "").trim().toLowerCase();
  const medium = (fields.utmMedium ?? "").trim().toLowerCase();

  // Click-ids are unambiguous paid-click markers.
  if (fields.gclid && fields.gclid.trim()) return "google_ads";
  if (fields.fbclid && fields.fbclid.trim()) return "meta";

  if (/facebook|instagram|meta|\bfb\b|\big\b/.test(src)) return "meta";
  if (/linkedin/.test(src)) return "linkedin";
  if (/podcast/.test(src)) return "podcast";
  if (/referr/.test(src)) return "referral";

  if (/google|bing|search/.test(src)) {
    // Paid vs organic hinges on the medium (cpc/ppc/paid) or an "ads" hint.
    if (/cpc|ppc|paid|ads?/.test(medium) || /ads?/.test(src)) return "google_ads";
    return "organic_search";
  }
  if (/organic/.test(src)) return "organic_search";
  if (/direct|none/.test(src)) return "direct";

  // A known legacy label may still arrive verbatim from an old scenario.
  const legacy = channelFromLegacyLeadSource(src);
  return legacy;
}
