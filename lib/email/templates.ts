/**
 * Email templates — plain HTML strings + plain-text fallbacks.
 *
 * Phase 1.4. Three templates, one shape: `(input) => EmailEnvelope`.
 *
 *   - `mention` — someone tagged you in a thread.
 *   - `actionItemAssigned` — someone assigned you an action item.
 *   - `actionItemDueSoon` — your action item is due in <24h.
 *
 * The HTML keeps the heritage-industrial look without a templating
 * engine: Drafting Cream `#F5F1E8` body, Foreman Black `#1A1A1A`
 * primary ink, Steel Blue `#2E4057` for links/buttons, and the
 * single-orange-accent rule from CLAUDE.md (used here only for the
 * overdue/due-soon cue). Inline styles, table-based layout — that's
 * what email clients still want in 2026.
 *
 * Subject lines lead with the value, not the brand: "Bruce mentioned
 * you in Action item: Send onboarding deck" — when it lands in a
 * crowded inbox, the recipient knows what it is at a glance.
 */

import { DateTime } from "luxon";
import type { EmailEnvelope } from "./send";

function appUrl(): string {
  // Trim a trailing slash so concatenation with a path is clean.
  const raw = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Strip markdown to plain text for the email's text/plain part. */
function flattenMarkdown(body: string, max = 240): string {
  const stripped = body
    .replace(/```[\s\S]*?```/g, "[code]")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "[image]")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    .replace(/_+([^_]+)_+/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length > max ? `${stripped.slice(0, max - 1)}…` : stripped;
}

/* ---------------------------- shared shell ---------------------------- */

function shell({
  preheader,
  heading,
  bodyHtml,
  buttonHref,
  buttonLabel,
  accent,
}: {
  preheader: string;
  heading: string;
  bodyHtml: string;
  buttonHref: string;
  buttonLabel: string;
  /** Optional accent color for the heading rule (e.g. orange for overdue). */
  accent?: string;
}): string {
  const safePreheader = escapeHtml(preheader);
  const safeHeading = escapeHtml(heading);
  const safeButtonLabel = escapeHtml(buttonLabel);
  const safeButtonHref = escapeHtml(buttonHref);
  const ruleColor = accent ?? "#2E4057";
  const logoUrl = `${appUrl()}/brand/logo-blue.png`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width" />
  <title>${safeHeading}</title>
</head>
<body style="margin:0;padding:0;background:#EADFC7;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;color:#1A1A1A;">
  <span style="display:none;font-size:0;line-height:0;max-height:0;max-width:0;opacity:0;overflow:hidden;">${safePreheader}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EADFC7;padding:48px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="680" cellpadding="0" cellspacing="0" border="0" style="max-width:680px;width:100%;background:#FFFFFF;border:1px solid #CCCCCC;border-radius:16px;">
          <tr>
            <td style="padding:36px 40px 24px 40px;border-bottom:1px solid #E5E5E5;text-align:center;">
              <a href="${escapeHtml(appUrl())}" style="display:inline-block;text-decoration:none;" aria-label="The Builder · By Workplaces">
                <img
                  src="${escapeHtml(logoUrl)}"
                  alt="Workplaces"
                  width="180"
                  style="display:block;margin:0 auto 16px auto;width:180px;max-width:60%;height:auto;border:0;outline:none;text-decoration:none;"
                />
              </a>
              <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#666666;font-weight:700;text-align:center;">
                The Builder · By Workplaces
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 40px 8px 40px;text-align:center;">
              <div style="font-size:26px;font-weight:700;color:#2E4057;line-height:1.25;letter-spacing:-0.01em;border-left:4px solid ${ruleColor};padding-left:14px;display:inline-block;text-align:left;">
                ${safeHeading}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px 32px 40px;font-size:16px;line-height:1.65;color:#1A1A1A;">
              ${bodyHtml}
              <div style="margin-top:32px;text-align:center;">
                <a href="${safeButtonHref}" style="display:inline-block;background:#2E4057;color:#FFFFFF;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:9999px;letter-spacing:0.04em;">
                  ${safeButtonLabel}
                </a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px 24px 40px;border-top:1px solid #E5E5E5;font-size:12px;color:#666666;line-height:1.6;text-align:center;">
              You're receiving this because you're a member of an engagement on the Business Builder Portal.<br>
              <span style="color:#2E4057;font-weight:700;letter-spacing:0.04em;">Build what compounds.</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/* ---------------------------- mention ---------------------------- */

export type MentionEmailInput = {
  to: string;
  recipientName: string;
  authorName: string;
  contextLabel: string; // "Action item: Send onboarding deck" / "Leadership thread"
  messageBody: string;
  url: string; // absolute path or full URL
};

export function mentionEmail(input: MentionEmailInput): EmailEnvelope {
  const url = input.url.startsWith("http") ? input.url : appUrl() + input.url;
  const subject = `${input.authorName} mentioned you in ${input.contextLabel}`;
  const preheader = flattenMarkdown(input.messageBody, 120);
  const safeQuote = escapeHtml(flattenMarkdown(input.messageBody, 600));

  const html = shell({
    preheader,
    heading: `${input.authorName} mentioned you`,
    bodyHtml: `
      <p style="margin:0 0 12px 0;">Hi ${escapeHtml(input.recipientName.split(" ")[0] ?? input.recipientName)},</p>
      <p style="margin:0 0 12px 0;">You were tagged in <strong>${escapeHtml(input.contextLabel)}</strong>.</p>
      <blockquote style="margin:16px 0;padding:12px 14px;border-left:3px solid #2E4057;background:#F5F1E8;font-size:14px;line-height:1.5;color:#1A1A1A;">
        ${safeQuote}
      </blockquote>
    `,
    buttonHref: url,
    buttonLabel: "View thread",
  });

  const text = [
    `${input.authorName} mentioned you in ${input.contextLabel}.`,
    "",
    flattenMarkdown(input.messageBody, 600),
    "",
    `View: ${url}`,
  ].join("\n");

  return { to: input.to, subject, html, text };
}

/* ---------------------------- assigned ---------------------------- */

export type ActionItemAssignedEmailInput = {
  to: string;
  recipientName: string;
  assignerName: string;
  itemTitle: string;
  itemDescription?: string | null;
  dueDate?: Date | null;
  url: string;
};

function formatDueDate(d: Date): string {
  const mt = DateTime.fromJSDate(d).setZone("America/Edmonton");
  return mt.toFormat("EEEE, MMMM d");
}

export function actionItemAssignedEmail(
  input: ActionItemAssignedEmailInput,
): EmailEnvelope {
  const url = input.url.startsWith("http") ? input.url : appUrl() + input.url;
  const subject = `${input.assignerName} assigned you: ${input.itemTitle}`;
  const dueLine = input.dueDate
    ? `Due <strong>${escapeHtml(formatDueDate(input.dueDate))}</strong>.`
    : "No due date set.";
  const descBlock = input.itemDescription
    ? `<blockquote style="margin:16px 0;padding:12px 14px;border-left:3px solid #2E4057;background:#F5F1E8;font-size:14px;line-height:1.5;color:#1A1A1A;">${escapeHtml(flattenMarkdown(input.itemDescription, 600))}</blockquote>`
    : "";

  const html = shell({
    preheader: input.itemTitle,
    heading: "New action item assigned",
    bodyHtml: `
      <p style="margin:0 0 12px 0;">Hi ${escapeHtml(input.recipientName.split(" ")[0] ?? input.recipientName)},</p>
      <p style="margin:0 0 12px 0;"><strong>${escapeHtml(input.assignerName)}</strong> assigned you a new action item:</p>
      <p style="margin:0 0 8px 0;font-size:17px;font-weight:700;color:#1A1A1A;">${escapeHtml(input.itemTitle)}</p>
      <p style="margin:0 0 12px 0;color:#666666;font-size:14px;">${dueLine}</p>
      ${descBlock}
    `,
    buttonHref: url,
    buttonLabel: "Open action item",
  });

  const text = [
    `${input.assignerName} assigned you a new action item.`,
    "",
    `Title: ${input.itemTitle}`,
    input.dueDate ? `Due: ${formatDueDate(input.dueDate)}` : "No due date set.",
    input.itemDescription
      ? "\n" + flattenMarkdown(input.itemDescription, 600)
      : "",
    "",
    `Open: ${url}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { to: input.to, subject, html, text };
}

/* ---------------------------- due-soon ---------------------------- */

export type ActionItemDueSoonEmailInput = {
  to: string;
  recipientName: string;
  itemTitle: string;
  dueDate: Date;
  url: string;
};

export function actionItemDueSoonEmail(
  input: ActionItemDueSoonEmailInput,
): EmailEnvelope {
  const url = input.url.startsWith("http") ? input.url : appUrl() + input.url;
  const subject = `Due tomorrow: ${input.itemTitle}`;

  const html = shell({
    preheader: `Due ${formatDueDate(input.dueDate)}.`,
    heading: "Action item due soon",
    accent: "#E87722", // Safety Vest Orange — single-accent rule from CLAUDE.md
    bodyHtml: `
      <p style="margin:0 0 12px 0;">Hi ${escapeHtml(input.recipientName.split(" ")[0] ?? input.recipientName)},</p>
      <p style="margin:0 0 12px 0;">A heads-up — this action item is due <strong>${escapeHtml(formatDueDate(input.dueDate))}</strong>.</p>
      <p style="margin:0 0 12px 0;font-size:17px;font-weight:700;color:#1A1A1A;">${escapeHtml(input.itemTitle)}</p>
    `,
    buttonHref: url,
    buttonLabel: "Open action item",
  });

  const text = [
    `Heads-up: "${input.itemTitle}" is due ${formatDueDate(input.dueDate)}.`,
    "",
    `Open: ${url}`,
  ].join("\n");

  return { to: input.to, subject, html, text };
}

/* -------------------------------- signing -------------------------------- */

export type SignatureRequestEmailInput = {
  to: string;
  signerName: string;
  senderName: string;
  envelopeSubject: string;
  message: string | null;
  signUrl: string; // /sign/<token>
};

export function signatureRequestEmail(
  input: SignatureRequestEmailInput,
): EmailEnvelope {
  const url = input.signUrl.startsWith("http")
    ? input.signUrl
    : appUrl() + input.signUrl;
  const subject = `${input.senderName} sent you a document to sign: ${input.envelopeSubject}`;
  const firstName =
    input.signerName.split(" ")[0] ?? input.signerName;
  const messageBlock = input.message
    ? `<p style="margin:0 0 20px 0;padding:16px 18px;background:#F5F1E8;border-left:3px solid #2E4057;font-style:italic;line-height:1.6;">${escapeHtml(input.message)}</p>`
    : "";

  const html = shell({
    preheader: `${input.senderName} sent you a document to sign.`,
    heading: "You have a document to sign",
    bodyHtml: `
      <p style="margin:0 0 18px 0;">Hi ${escapeHtml(firstName)},</p>
      <p style="margin:0 0 18px 0;"><strong>${escapeHtml(input.senderName)}</strong> sent you the following document to review and sign:</p>
      <p style="margin:0 0 20px 0;padding:14px 18px;background:#F5F1E8;border-left:4px solid #E87722;font-size:18px;font-weight:700;color:#1A1A1A;line-height:1.4;">${escapeHtml(input.envelopeSubject)}</p>
      ${messageBlock}
      <p style="margin:0 0 12px 0;">The link below opens the document and a signature panel — type or draw your signature, then click Sign. No account required.</p>
    `,
    buttonHref: url,
    buttonLabel: "Review and sign",
  });

  const text = [
    `${input.senderName} sent you a document to sign: ${input.envelopeSubject}`,
    "",
    input.message ? `Message: ${input.message}` : null,
    input.message ? "" : null,
    `Sign here: ${url}`,
    "",
    "No account required. Type or draw your signature, then click Sign.",
  ]
    .filter((l) => l !== null)
    .join("\n");

  return { to: input.to, subject, html, text };
}

export type SignatureCompletedEmailInput = {
  to: string;
  recipientName: string;
  envelopeSubject: string;
  envelopeUrl: string; // /coach/envelopes/<id> (for sender) or shared link
  isSender: boolean;
};

/* ---------------------------- diagnostic invite ---------------------------- */

export type DiagnosticInviteEmailInput = {
  to: string;
  recipientName: string | null;
  senderName: string;
  diagnosticUrl: string;
  personalNote: string | null;
};

/**
 * Diagnostic invitation — Business Builder sending the public intake
 * form to a prospect they're already in conversation with. Friendly,
 * short, gives them an out if the timing isn't right.
 */
export function diagnosticInviteEmail(
  input: DiagnosticInviteEmailInput,
): EmailEnvelope {
  const url = input.diagnosticUrl.startsWith("http")
    ? input.diagnosticUrl
    : appUrl() + input.diagnosticUrl;
  const firstName = (input.recipientName ?? "")
    .trim()
    .split(/\s+/)[0];
  const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : "Hello,";
  const subject = `Quick business diagnostic from ${input.senderName} — 5 minutes`;
  const personalBlock = input.personalNote
    ? `<blockquote style="margin:16px 0;padding:12px 14px;border-left:3px solid #2C6CB0;background:#F4F6F9;font-size:14px;line-height:1.5;color:#14181D;">${escapeHtml(input.personalNote)}</blockquote>`
    : "";

  const html = shell({
    preheader: `${input.senderName} is asking you to fill out a short business diagnostic.`,
    heading: "A quick diagnostic for you",
    bodyHtml: `
      <p style="margin:0 0 12px 0;">${greeting}</p>
      <p style="margin:0 0 12px 0;">
        Before our next conversation, I&rsquo;d love to get a clearer picture
        of where your business is today and what would move it forward. The
        diagnostic below takes about five minutes and gives me a real head
        start so our time together is high signal.
      </p>
      ${personalBlock}
      <p style="margin:0 0 12px 0;">
        — ${escapeHtml(input.senderName)}
      </p>
    `,
    buttonHref: url,
    buttonLabel: "Open the diagnostic",
  });

  const text = [
    greeting,
    "",
    `Before our next conversation, I'd love to get a clearer picture of where your business is today. The diagnostic below takes about five minutes:`,
    "",
    url,
    "",
    input.personalNote ? input.personalNote : null,
    input.personalNote ? "" : null,
    `— ${input.senderName}`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  return { to: input.to, subject, html, text };
}

/* ---------------------------- new web lead ---------------------------- */

export type NewLeadEmailInput = {
  to: string;
  companyName: string;
  contactName: string | null;
  contactEmail: string;
  phone: string | null;
  leadSource: string;
  message: string | null;
  prospectUrl: string; // /coach/pipeline/<id>
};

/**
 * New lead intake email — fires when someone fills out the public web
 * form and we want every master_admin / coach to know within minutes.
 * Single Safety Vest Orange accent (per the brand guide) because a new
 * lead deserves the same visual urgency as an overdue action item.
 */
export function newLeadEmail(input: NewLeadEmailInput): EmailEnvelope {
  const url = input.prospectUrl.startsWith("http")
    ? input.prospectUrl
    : appUrl() + input.prospectUrl;
  const subject = `New lead: ${input.companyName} (${input.leadSource})`;

  const contactLine = input.contactName
    ? `${escapeHtml(input.contactName)} &lt;${escapeHtml(input.contactEmail)}&gt;`
    : escapeHtml(input.contactEmail);
  const phoneLine = input.phone
    ? `<div><strong>Phone:</strong> ${escapeHtml(input.phone)}</div>`
    : "";
  const messageBlock = input.message
    ? `<blockquote style="margin:16px 0;padding:12px 14px;border-left:3px solid #E87722;background:#FFF7EE;font-size:14px;line-height:1.5;color:#1A1A1A;">${escapeHtml(flattenMarkdown(input.message, 800))}</blockquote>`
    : "";

  const html = shell({
    preheader: `${input.companyName} just submitted the web form via ${input.leadSource}.`,
    heading: "New lead just landed",
    accent: "#E87722", // Safety Vest Orange — urgency accent
    bodyHtml: `
      <p style="margin:0 0 12px 0;">A new lead just came in through <strong>${escapeHtml(input.leadSource)}</strong>. First Business Builder to claim it owns the follow-up.</p>
      <div style="margin:16px 0;padding:12px 14px;background:#F5F1E8;border:1px solid #E8ECF1;border-radius:8px;font-size:14px;line-height:1.7;">
        <div><strong>Company:</strong> ${escapeHtml(input.companyName)}</div>
        <div><strong>Contact:</strong> ${contactLine}</div>
        ${phoneLine}
        <div><strong>Source:</strong> ${escapeHtml(input.leadSource)}</div>
      </div>
      ${messageBlock}
      <p style="margin:0 0 12px 0;font-size:13px;color:#5A6470;">Open the prospect in the Pipeline to log first contact, set a next action, or move them through the stages.</p>
    `,
    buttonHref: url,
    buttonLabel: "Open prospect",
  });

  const text = [
    `New lead via ${input.leadSource}`,
    "",
    `Company: ${input.companyName}`,
    `Contact: ${input.contactName ? input.contactName + " <" + input.contactEmail + ">" : input.contactEmail}`,
    input.phone ? `Phone: ${input.phone}` : null,
    "",
    input.message ? `Message:\n${flattenMarkdown(input.message, 800)}` : null,
    input.message ? "" : null,
    `Open: ${url}`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  return { to: input.to, subject, html, text };
}

export function signatureCompletedEmail(
  input: SignatureCompletedEmailInput,
): EmailEnvelope {
  const url = input.envelopeUrl.startsWith("http")
    ? input.envelopeUrl
    : appUrl() + input.envelopeUrl;
  const subject = `Signed: ${input.envelopeSubject}`;
  const firstName =
    input.recipientName.split(" ")[0] ?? input.recipientName;

  const html = shell({
    preheader: "Everyone has signed. The signed copy is attached.",
    heading: "All signed.",
    bodyHtml: `
      <p style="margin:0 0 12px 0;">Hi ${escapeHtml(firstName)},</p>
      <p style="margin:0 0 12px 0;">Every signer has completed <strong>${escapeHtml(input.envelopeSubject)}</strong>. The fully-signed copy is attached and stored in your portal for the record.</p>
      ${
        input.isSender
          ? `<p style="margin:0 0 12px 0;">You can view the full audit trail in the envelope detail page below.</p>`
          : `<p style="margin:0 0 12px 0;">Keep this email for your records — the attached PDF includes the certificate of completion with the audit trail.</p>`
      }
    `,
    buttonHref: url,
    buttonLabel: input.isSender ? "View envelope" : "Open document",
  });

  const text = [
    `All signers have completed "${input.envelopeSubject}".`,
    "",
    `Open: ${url}`,
  ].join("\n");

  return { to: input.to, subject, html, text };
}
