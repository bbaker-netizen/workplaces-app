/**
 * Email-template variables + helper utilities. Lives outside the
 * "use server" file because that file is only allowed to export async
 * functions; constants and pure utilities live here so client and
 * server code can import them freely.
 */

export const TEMPLATE_VARIABLES = [
  { name: "company_name", label: "Company name" },
  { name: "contact_name", label: "Contact full name" },
  { name: "contact_first_name", label: "Contact first name" },
  { name: "contact_email", label: "Contact email" },
  { name: "sender_name", label: "Your full name" },
  { name: "sender_first_name", label: "Your first name" },
  { name: "sender_email", label: "Your email" },
  {
    name: "contact_partner_first_name",
    label: "Client's business partner — first name",
  },
  {
    name: "partner_first_name",
    label: "The OTHER Business Builder's first name",
  },
  /* --- Solo-vs-two-partner wording. Resolved server-side so the sentence
     reads correctly either way, instead of leaving a dangling "and" or a
     plural noun when a client has no partner. --- */
  {
    name: "client_and_partner",
    label: "\"you\" or \"you and <partner>\"",
  },
  { name: "assessment_noun", label: "\"Assessment\" or \"Assessments\"" },
  {
    name: "assessment_due_date",
    label: "Assessment due date (one week before the first session)",
  },
  {
    name: "assessment_deadline_sentence",
    label: "\"by <date>\" or \"one week before our first session\"",
  },
  {
    name: "assessment_completed_sentence",
    label: "\"We need it completed\" / \"We need these completed\"",
  },
  {
    name: "availability_link",
    label: "Link to this client's availability grid",
  },
] as const;

/**
 * Variables whose value has a side effect — resolving them creates
 * something. Only minted when the template actually references one, so
 * previewing an unrelated template can't leave stray rows behind.
 */
export const SIDE_EFFECT_VARIABLES = ["availability_link"] as const;

/** Does this template text reference `{{name}}`? */
export function templateUsesVariable(text: string, name: string): boolean {
  return new RegExp(`\\{\\{\\s*${name}(_url)?\\s*\\}\\}`).test(text);
}

export const TEMPLATE_CATEGORIES = [
  "onboarding",
  "contract",
  "proposal",
  "follow_up",
  "intro",
  // Automation-driven: the booking follow-through sequence seeds three
  // templates under this category. Must be a valid enum value so those
  // rows save through the Templates editor like any other.
  "booking_follow_through",
  "other",
] as const;

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

/**
 * Resolve {{variable}} placeholders against a context object. Unknown
 * variables stay as `{{name}}` so the sender notices and edits them
 * before hitting send.
 */
export function applyTemplate(
  text: string,
  vars: Record<string, string | null | undefined>,
): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, name) => {
    // `{{company_name_url}}` resolves company_name, URL-encoded. Needed
    // because a template can carry a link with the prospect's details in the
    // query string, and a company like "Acme Roofing" would otherwise put a
    // raw space in the URL. Most mail clients stop the hyperlink at that
    // space, so the recipient gets a broken link and never says why.
    const urlSafe = name.endsWith("_url");
    const key = urlSafe ? name.slice(0, -"_url".length) : name;
    const v = vars[key];
    if (v === undefined || v === null || v === "") {
      return `{{${name}}}`;
    }
    return urlSafe ? encodeURIComponent(v) : v;
  });
}
