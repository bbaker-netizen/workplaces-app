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
  sender: {
    fullName: string;
    email: string;
  };
};

export const DOCUMENT_VARIABLES = [
  {
    name: "client_name",
    label: "Client first name",
    description: "Their first name (from contactName / lead full name)",
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
      "Engagement's monthly fee, formatted as $2,500/month. Pulls from the engagement record.",
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
  const firstName =
    ctx.prospect?.contactName?.split(" ")[0] ??
    ctx.prospect?.contactName ??
    "[client]";
  const senderFirstName =
    ctx.sender.fullName.split(" ")[0] ?? ctx.sender.fullName;
  const today = formatDate(new Date());

  // Prefer prospect-level values for program + fee + start date,
  // fall back to engagement-level for back-compat.
  const programType =
    ctx.prospect?.programType ?? ctx.engagement?.type ?? null;
  const monthlyFeeCents =
    ctx.prospect?.monthlyFeeCents ?? ctx.engagement?.monthlyFeeCents ?? null;
  const startDate =
    ctx.prospect?.expectedStartDate ?? ctx.engagement?.startDate ?? null;

  return {
    client_name: firstName,
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
    today,
    sender_name: senderFirstName,
    sender_full_name: ctx.sender.fullName,
    sender_email: ctx.sender.email,
  };
}

/** Substitute every `{{variable}}` in body with its value. Unknown
 *  variables are left alone (wrapped in `[]` brackets so they stand
 *  out as "you forgot to fill this"). */
export function applyDocumentVariables(
  body: string,
  vars: Record<string, string>,
): string {
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_match, name) => {
    const key = String(name).toLowerCase();
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      return vars[key];
    }
    return `[${name}]`;
  });
}
