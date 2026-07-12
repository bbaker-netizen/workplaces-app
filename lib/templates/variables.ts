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
] as const;

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
    const v = vars[name];
    if (v === undefined || v === null || v === "") {
      return `{{${name}}}`;
    }
    return v;
  });
}
