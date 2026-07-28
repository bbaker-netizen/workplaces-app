/**
 * Document template variables — the set of `{{placeholder}}` tokens
 * a signing document template can use, and the resolver that fills
 * them from prospect / engagement / sender context at compose time.
 *
 * Shared between the templates editor (so Bruce sees the chip list)
 * and the compose flow (so the body is pre-filled when he picks a
 * template).
 */

export type DocumentVariableContext = {
  prospect?: {
    contactName: string | null;
    /** Stored parts. Preferred over splitting `contactName`, which guesses
     *  wrong for compound given names and for anyone with a title. */
    contactFirstName?: string | null;
    contactLastName?: string | null;
    companyName: string;
    contactEmail: string;
    /** Phone is now required on every prospect (see
     *  lib/pipeline/validate-prospect.ts) so the contract can include
     *  it. Stays nullable here for historical rows that pre-date the
     *  rule — `{{client_phone}}` falls back to "[phone]" in that case. */
    phone?: string | null;
    /** Per Phase 5.4: program + tier + fee + start date now live on
     *  the prospect record so the BBA can be sent before the
     *  engagement is formally created. These take precedence over
     *  the corresponding `engagement.*` fields when present. */
    programType?: "accelerator" | "implementer" | null;
    monthlyFeeCents?: number | null;
    expectedStartDate?: Date | string | null;
  } | null;
  engagement?: {
    name: string | null;
    type?: "accelerator" | "implementer" | null;
    startDate?: Date | string | null;
    /** Monthly fee in cents (e.g., 250000 = $2,500/month). Renders as
     *  "$2,500/month" via the `{{monthly_fee}}` placeholder. When null
     *  the placeholder renders as "[monthly fee]" so Bruce sees
     *  immediately that he needs to fill it in. */
    monthlyFeeCents?: number | null;
  } | null;
  /** The programme tier picked when preparing the agreement. Drives the
   *  fee AND the Schedule A wording, so the price and what it buys always
   *  come from the same row in Settings > Pricing tiers. */
  pricingTier?: {
    program: "accelerator" | "implementer" | string;
    label: string;
    monthlyFeeCents: number;
    scheduleADetail?: string | null;
  } | null;
  sender: {
    fullName: string;
    email: string;
  };
  /** Your business (the sending party). Drives the BBA preamble
   *  ("HR All-In Inc., operating as Workplaces, in the Province of
   *  Alberta…") so a single template works for any province/country
   *  the Coach operates in. All fields optional — missing values
   *  render as `[placeholder]` so it's obvious what to fill in. */
  org?: {
    name?: string | null;
    legalName?: string | null;
    address?: string | null;
    city?: string | null;
    province?: string | null;
    country?: string | null;
    postalCode?: string | null;
    phone?: string | null;
    website?: string | null;
    taxId?: string | null;
  } | null;
};

export const DOCUMENT_VARIABLES = [
  {
    name: "client_name",
    label: "Client first name",
    description: "Their first name (from contactName / lead full name)",
  },
  {
    name: "client_last_name",
    label: "Client last name",
    description: "Their surname, from the Last name field on the lead",
  },
  {
    name: "client_full_name",
    label: "Client full name",
    description: "Full contact name",
  },
  {
    name: "company_name",
    label: "Company name",
    description: "Their business name",
  },
  {
    name: "contact_email",
    label: "Client email",
    description: "Their email address",
  },
  {
    name: "client_phone",
    label: "Client phone",
    description: "Their phone number (required on every prospect)",
  },
  {
    name: "engagement_name",
    label: "Engagement name",
    description: "The engagement title (defaults to company name if blank)",
  },
  {
    name: "engagement_type",
    label: "Engagement type",
    description: "Accelerator or Implementer",
  },
  {
    name: "accelerator_checkbox",
    label: "Accelerator checkbox",
    description: "[X] if Accelerator, [ ] otherwise — for program-pick checkbox in BBA",
  },
  {
    name: "implementer_checkbox",
    label: "Implementer checkbox",
    description: "[X] if Implementer, [ ] otherwise — for program-pick checkbox in BBA",
  },
  {
    name: "start_date",
    label: "Engagement start date",
    description: "When the engagement begins",
  },
  {
    name: "monthly_fee",
    label: "Monthly fee",
    description:
      "Monthly fee, formatted as $2,500/month. Comes from the programme tier picked when preparing the agreement, falling back to the engagement record.",
  },
  {
    name: "program_name",
    label: "Programme",
    description: "Accelerator or Implementer, from the tier picked.",
  },
  {
    name: "schedule_a",
    label: "Schedule A detail",
    description:
      "What the picked tier includes. Written per tier in Settings > Pricing tiers, so the price and the deliverables stay together.",
  },
  {
    name: "today",
    label: "Today's date",
    description: "Today, written out as Month D, YYYY",
  },
  {
    name: "sender_name",
    label: "Sender first name",
    description: "Your first name",
  },
  {
    name: "sender_full_name",
    label: "Sender full name",
    description: "Your full name",
  },
  {
    name: "sender_email",
    label: "Sender email",
    description: "Your email",
  },
  /* ----- Your business (org-level) ----- */
  {
    name: "org_name",
    label: "Your business name",
    description: "Display name (e.g. Workplaces). Set under Settings → Company info.",
  },
  {
    name: "org_legal_name",
    label: "Your legal entity name",
    description:
      "Full registered name (e.g. HR All-In Inc.). Falls back to display name if not set.",
  },
  {
    name: "org_address",
    label: "Your street address",
    description: "Street + suite, single line.",
  },
  {
    name: "org_city",
    label: "Your business city",
    description: "City (e.g. Edmonton)",
  },
  {
    name: "org_province",
    label: "Your business province / state",
    description: "Province or state (e.g. Alberta). Used in contract preambles.",
  },
  {
    name: "org_country",
    label: "Your business country",
    description: "Country (e.g. Canada)",
  },
  {
    name: "org_phone",
    label: "Your business phone",
    description: "Main business phone",
  },
  {
    name: "org_website",
    label: "Your business website",
    description: "URL",
  },
  {
    name: "org_tax_id",
    label: "Your tax ID",
    description: "GST/HST/EIN/VAT — required on invoices",
  },
] as const;

export const DOCUMENT_TEMPLATE_CATEGORIES = [
  "contract",
  "proposal",
  "nda",
  "renewal",
  "other",
] as const;

export type DocumentTemplateCategory =
  (typeof DOCUMENT_TEMPLATE_CATEGORIES)[number];

/**
 * Render a cents amount as a dollar string. Drops the `.00` when the
 * amount is whole dollars (almost always — fees are typically whole
 * hundreds), otherwise shows two decimals.
 *
 *   250000  → "$2,500"
 *   299900  → "$2,999"
 *   250050  → "$2,500.50"
 */
function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || Number.isNaN(cents)) {
    return "[monthly fee]";
  }
  const dollars = cents / 100;
  const isWhole = cents % 100 === 0;
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(dollars);
  return `${formatted}/month`;
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "[start date]";
  try {
    const date = typeof d === "string" ? new Date(d) : d;
    if (Number.isNaN(date.getTime())) return "[start date]";
    return date.toLocaleDateString("en-CA", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "[start date]";
  }
}

/** Build the variable map from context.
 *
 * Resolution order for the deal-specific values (program type, fee,
 * start date): prospect → engagement → "[placeholder]". The prospect
 * is the single source of truth — by the time an engagement is
 * created, these fields have been chosen on the prospect record. The
 * engagement fallback is for backwards compatibility with the older
 * flow where the BBA was sent post-engagement-creation.
 */
export function buildVariableMap(
  ctx: DocumentVariableContext,
): Record<string, string> {
  // Stored first name wins. Splitting the display name on the first space is
  // the fallback for rows written before the columns existed — it is a guess,
  // and it is wrong for "Mary Anne Fletcher".
  const firstName =
    ctx.prospect?.contactFirstName?.trim() ||
    ctx.prospect?.contactName?.split(" ")[0] ||
    ctx.prospect?.contactName ||
    "[client]";
  const lastName =
    ctx.prospect?.contactLastName?.trim() ||
    (ctx.prospect?.contactName?.trim().includes(" ")
      ? ctx.prospect.contactName.trim().slice(
          ctx.prospect.contactName.trim().indexOf(" ") + 1,
        )
      : "") ||
    "[client surname]";
  const senderFirstName =
    ctx.sender.fullName.split(" ")[0] ?? ctx.sender.fullName;
  const today = formatDate(new Date());

  // Prefer prospect-level values for program + fee + start date,
  // fall back to engagement-level for back-compat.
  // The picked tier wins for BOTH the programme and the fee. It is the most
  // deliberate signal there is — someone chose this tier for this deal on the
  // way to sending the contract — where the prospect/engagement values may be
  // months stale.
  const tier = ctx.pricingTier ?? null;
  const programType =
    (tier?.program as "accelerator" | "implementer" | undefined) ??
    ctx.prospect?.programType ??
    ctx.engagement?.type ??
    null;
  const monthlyFeeCents =
    tier?.monthlyFeeCents ??
    ctx.prospect?.monthlyFeeCents ??
    ctx.engagement?.monthlyFeeCents ??
    null;
  const startDate =
    ctx.prospect?.expectedStartDate ?? ctx.engagement?.startDate ?? null;

  return {
    client_name: firstName,
    client_last_name: lastName,
    client_full_name: ctx.prospect?.contactName ?? "[client name]",
    company_name:
      ctx.prospect?.companyName ?? ctx.engagement?.name ?? "[company]",
    contact_email: ctx.prospect?.contactEmail ?? "[client email]",
    client_phone: ctx.prospect?.phone ?? "[phone]",
    engagement_name:
      ctx.engagement?.name ?? ctx.prospect?.companyName ?? "[engagement]",
    engagement_type:
      programType === "accelerator"
        ? "Accelerator"
        : programType === "implementer"
          ? "Implementer"
          : "[type]",
    // Pre-filled checkbox glyphs for the BBA Schedule A program
    // selection. Renders as `[X]` next to whichever program is
    // selected, `[ ]` next to the other. When neither is set
    // both stay `[ ]` so the client can mark by hand.
    accelerator_checkbox: programType === "accelerator" ? "[X]" : "[ ]",
    implementer_checkbox: programType === "implementer" ? "[X]" : "[ ]",
    start_date: formatDate(startDate),
    monthly_fee: formatCents(monthlyFeeCents),
    program_name: programType
      ? programType === "accelerator"
        ? "Accelerator"
        : "Implementer"
      : "[programme]",
    // Deliberately empty, and no longer offered in the variable picker.
    // Tier labels are internal pricing segmentation — "> 3 Million Annual
    // Revenue" is how the practice bands its own book, not something a
    // client should read in their own agreement. Resolving to "" rather
    // than removing the key means templates that already reference it stop
    // printing the label immediately, without anyone having to edit them.
    program_tier: "",
    // A tier with no Schedule A written up yet says so in the draft rather
    // than rendering an empty schedule that nobody notices until the client
    // asks what they are actually buying.
    schedule_a:
      tier?.scheduleADetail?.trim() ||
      "[Schedule A detail — add it to this tier in Settings > Pricing tiers]",
    today,
    sender_name: senderFirstName,
    sender_full_name: ctx.sender.fullName,
    sender_email: ctx.sender.email,
    // Org / sending party. Each variable falls back to a visible
    // bracket placeholder so missing data is obvious in the PDF.
    org_name: ctx.org?.name ?? "[your business name]",
    org_legal_name: ctx.org?.legalName ?? ctx.org?.name ?? "[your legal name]",
    org_address: ctx.org?.address ?? "[address]",
    org_city: ctx.org?.city ?? "[city]",
    org_province: ctx.org?.province ?? "[province]",
    org_country: ctx.org?.country ?? "[country]",
    org_phone: ctx.org?.phone ?? "[phone]",
    org_website: ctx.org?.website ?? "[website]",
    org_tax_id: ctx.org?.taxId ?? "[tax ID]",
  };
}

/** Substitute every `{{variable}}` in body with its value. Unknown
 *  variables are left alone (wrapped in `[]` brackets so they stand
 *  out as "you forgot to fill this"). */
export function applyDocumentVariables(
  body: string,
  vars: Record<string, string>,
): string {
  // Template bodies come out of the Tiptap editor as HTML. Substitution is a
  // raw string replace, so a MULTI-LINE value dropped into HTML loses every
  // line break — the Schedule A detail written as four separate inclusions
  // would render as one run-on paragraph — and a stray "&" or "<" in the text
  // would be read as markup. Escape and convert line breaks for multi-line
  // values when the body is HTML.
  //
  // <br /> rather than <p>: the placeholder usually sits INSIDE a paragraph,
  // and nesting a <p> there is invalid and renders unpredictably.
  const isHtml = body.trim().startsWith("<");

  const forBody = (value: string): string => {
    if (!isHtml || !value.includes("\n")) return value;
    return value
      .split(/\r?\n/)
      .map((line) =>
        line
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;"),
      )
      .join("<br />");
  };

  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_match, name) => {
    const key = String(name).toLowerCase();
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      return forBody(vars[key]);
    }
    return `[${name}]`;
  });
}
