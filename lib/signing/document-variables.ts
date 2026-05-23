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
  } | null;
  engagement?: {
    name: string | null;
    type?: "accelerator" | "implementer" | null;
    startDate?: Date | string | null;
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

/** Build the variable map from context. */
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

  return {
    client_name: firstName,
    client_full_name: ctx.prospect?.contactName ?? "[client name]",
    company_name:
      ctx.prospect?.companyName ?? ctx.engagement?.name ?? "[company]",
    contact_email: ctx.prospect?.contactEmail ?? "[client email]",
    engagement_name:
      ctx.engagement?.name ?? ctx.prospect?.companyName ?? "[engagement]",
    engagement_type:
      ctx.engagement?.type === "accelerator"
        ? "Accelerator"
        : ctx.engagement?.type === "implementer"
          ? "Implementer"
          : "[type]",
    // Pre-filled checkbox glyphs for the BBA Schedule A program
    // selection. Renders as `[X]` next to whichever program the
    // engagement is, `[ ]` next to the other. When the engagement
    // type is unset (e.g., sending from a prospect before formal
    // engagement), both stay `[ ]` so the client can mark by hand.
    accelerator_checkbox:
      ctx.engagement?.type === "accelerator" ? "[X]" : "[ ]",
    implementer_checkbox:
      ctx.engagement?.type === "implementer" ? "[X]" : "[ ]",
    start_date: formatDate(ctx.engagement?.startDate),
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
