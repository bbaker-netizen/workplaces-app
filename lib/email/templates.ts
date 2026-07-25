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
import type { DigestPayload } from "@/lib/ea/digest-data";
import type { EngagementHours } from "@/lib/ea/engagement-hours";
import type { JobHeartbeat } from "@/lib/ea/job-runs";

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

/**
 * Bulletproof button — VML for Outlook, styled anchor everywhere else.
 *
 * The shell's single footer button is a plain anchor, which is fine for
 * a "view thread" link. It is NOT fine for the approve buttons the EA
 * emails carry: Outlook renders a styled anchor as a bare blue link, and
 * an approve action that looks like a footnote does not get tapped. The
 * conditional-comment VML rect below is the only construction Outlook's
 * Word rendering engine draws as an actual button.
 *
 * Used inline inside `bodyHtml`, as many times as a message needs.
 */
export function bulletproofButton({
  href,
  label,
  background = "#2E4057",
  width = 240,
}: {
  href: string;
  label: string;
  background?: string;
  width?: number;
}): string {
  const safeHref = escapeHtml(href);
  const safeLabel = escapeHtml(label);
  return `
<div>
  <!--[if mso]>
  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeHref}" style="height:44px;v-text-anchor:middle;width:${width}px;" arcsize="50%" stroke="f" fillcolor="${background}">
    <w:anchorlock/>
    <center style="color:#FFFFFF;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${safeLabel}</center>
  </v:roundrect>
  <![endif]-->
  <!--[if !mso]><!-- -->
  <a href="${safeHref}" style="display:inline-block;background:${background};color:#FFFFFF;text-decoration:none;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;font-weight:bold;font-size:15px;line-height:44px;height:44px;padding:0 28px;border-radius:9999px;letter-spacing:0.03em;text-align:center;">${safeLabel}</a>
  <!--<![endif]-->
</div>`.trim();
}

export function shell({
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

/* -------------------------- new message -------------------------- */

/** Sent to a thread's participants (other than the author / mentioned
 *  users) when a new message is posted — the "you have a new message"
 *  notification by email. Reuses MentionEmailInput's shape. */
export function newMessageEmail(input: MentionEmailInput): EmailEnvelope {
  const url = input.url.startsWith("http") ? input.url : appUrl() + input.url;
  const subject = `New message from ${input.authorName} — ${input.contextLabel}`;
  const preheader = flattenMarkdown(input.messageBody, 120);
  const safeQuote = escapeHtml(flattenMarkdown(input.messageBody, 600));

  const html = shell({
    preheader,
    heading: `New message from ${input.authorName}`,
    bodyHtml: `
      <p style="margin:0 0 12px 0;">Hi ${escapeHtml(input.recipientName.split(" ")[0] ?? input.recipientName)},</p>
      <p style="margin:0 0 12px 0;">There's a new message in <strong>${escapeHtml(input.contextLabel)}</strong>.</p>
      <blockquote style="margin:16px 0;padding:12px 14px;border-left:3px solid #2E4057;background:#F5F1E8;font-size:14px;line-height:1.5;color:#1A1A1A;">
        ${safeQuote}
      </blockquote>
    `,
    buttonHref: url,
    buttonLabel: "View thread",
  });

  const text = [
    `New message from ${input.authorName} in ${input.contextLabel}.`,
    "",
    flattenMarkdown(input.messageBody, 600),
    "",
    `View: ${url}`,
  ].join("\n");

  return { to: input.to, subject, html, text };
}

/* ------------------------ document shared ------------------------ */

export type DocumentSharedEmailInput = {
  to: string;
  recipientName: string;
  uploaderName: string;
  filename: string;
  url: string;
};

export function documentSharedEmail(
  input: DocumentSharedEmailInput,
): EmailEnvelope {
  const url = input.url.startsWith("http") ? input.url : appUrl() + input.url;
  const subject = `${input.uploaderName} shared a document — ${input.filename}`;

  const html = shell({
    preheader: `${input.uploaderName} shared ${input.filename}`,
    heading: "A new document was shared",
    bodyHtml: `
      <p style="margin:0 0 12px 0;">Hi ${escapeHtml(input.recipientName.split(" ")[0] ?? input.recipientName)},</p>
      <p style="margin:0 0 12px 0;"><strong>${escapeHtml(input.uploaderName)}</strong> shared a new document with you:</p>
      <p style="margin:0 0 12px 0;font-size:15px;"><strong>${escapeHtml(input.filename)}</strong></p>
    `,
    buttonHref: url,
    buttonLabel: "View documents",
  });

  const text = [
    `${input.uploaderName} shared a new document: ${input.filename}`,
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
      <p style="margin:18px 0 0 0;padding:12px 14px;background:#F5F1E8;border:1px solid #E5DCC5;border-radius:6px;font-size:13px;line-height:1.55;color:#3A3A3A;">
        <strong style="display:block;margin-bottom:4px;color:#1A1A1A;">Signing electronically</strong>
        By clicking the link above and completing the signing process, you agree to sign this document electronically. If you prefer to sign on paper or have any questions, simply reply to this email and we&rsquo;ll send a printed copy. Your name, email, IP address, browser, and timestamps will be recorded as evidence of this signing.
      </p>
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
    "",
    "Signing electronically:",
    "By clicking the link and completing the signing process, you agree to sign this document electronically. If you prefer to sign on paper or have any questions, simply reply to this email and we'll send a printed copy. Your name, email, IP address, browser, and timestamps will be recorded as evidence of this signing.",
  ]
    .filter((l) => l !== null)
    .join("\n");

  return { to: input.to, subject, html, text };
}

export type SignatureCompletedEmailInput = {
  to: string;
  recipientName: string;
  envelopeSubject: string;
  envelopeUrl: string; // /business-builder/envelopes/<id> (for sender) or shared link
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
 * Diagnostic invitation — Coach sending the public intake
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
  prospectUrl: string; // /business-builder/pipeline/<id>
};

/**
 * New lead intake email — fires when someone fills out the public web
 * form and we want every master_admin / Coach to know within minutes.
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
      <p style="margin:0 0 12px 0;">A new lead just came in through <strong>${escapeHtml(input.leadSource)}</strong>. First Coach to claim it owns the follow-up.</p>
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

export type ReferralRewardEmailInput = {
  to: string;
  coachName: string;
  referrer: string;
  companyName: string;
};

/**
 * Sent to the coach when a referred prospect converts to an active
 * engagement — the cue to buy the $50 gift certificate + thank-you card
 * for the referrer. Pairs with the action-item task created on conversion.
 */
export function referralRewardEmail(
  input: ReferralRewardEmailInput,
): EmailEnvelope {
  const url = appUrl() + "/business-builder/engagements";
  const subject = `Thank-you owed: $50 gift cert for ${input.referrer}`;

  const html = shell({
    preheader: `${input.companyName} converted — send ${input.referrer} their referral thank-you.`,
    heading: "Referral converted — send the thank-you",
    accent: "#E87722",
    bodyHtml: `
      <p style="margin:0 0 12px 0;">Hi ${escapeHtml(input.coachName)}, <strong>${escapeHtml(input.companyName)}</strong> just became an active engagement — and they came in as a referral from <strong>${escapeHtml(input.referrer)}</strong>.</p>
      <p style="margin:0 0 12px 0;">Time to say thanks: buy a <strong>$50 gift certificate</strong> and send it with a thank-you card to ${escapeHtml(input.referrer)}.</p>
      <p style="margin:0 0 12px 0;font-size:13px;color:#5A6470;">A matching task has been added to your work list so it doesn't slip.</p>
    `,
    buttonHref: url,
    buttonLabel: "Open The Builder",
  });

  const text = [
    `Referral converted — send the thank-you`,
    "",
    `${input.companyName} just became an active engagement, referred by ${input.referrer}.`,
    `Buy a $50 gift certificate and send it with a thank-you card to ${input.referrer}.`,
    "",
    `A matching task has been added to your work list.`,
    `Open: ${url}`,
  ].join("\n");

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

/* ---------------------- engagement welcome (branded) ----------------------
 *
 * Fires when Bruce creates a new engagement. This is the personal,
 * vibrant welcome that lands BEFORE Clerk's generic invitation email —
 * the recipient gets the Workplaces brand experience first, then
 * Clerk's technical accept link follows for the actual sign-up.
 *
 * Tone: warm, plain-spoken, like Bruce wrote it himself. Includes:
 *   - "What is the Business Building Program" — one sentence
 *   - What happens next — three concrete steps
 *   - Accept invitation CTA → Clerk's accept URL
 *   - Sign-off from Bruce
 *
 * Heading rule: Safety Vest Orange (single-accent rule) — this is a
 * happy moment, the warmest of the transactional emails we send.
 */

export type EngagementWelcomeEmailInput = {
  to: string;
  recipientName: string;
  engagementName: string;
  engagementType: "accelerator" | "implementer";
  startDate: string; // YYYY-MM-DD
  acceptUrl: string;
  senderName: string;
  senderEmail: string;
  /** Optional title under the sender's name in the sign-off. */
  senderTitle?: string | null;
};

export function engagementWelcomeEmail(
  input: EngagementWelcomeEmailInput,
): EmailEnvelope {
  const firstName =
    input.recipientName.split(" ")[0] ?? input.recipientName;
  const senderFirstName =
    input.senderName.split(" ")[0] ?? input.senderName;
  const programLabel =
    input.engagementType === "accelerator"
      ? "Workplaces Business Building Program · Accelerator"
      : "Workplaces Business Building Program · Implementer";
  const startDateLabel = (() => {
    try {
      return DateTime.fromISO(input.startDate, {
        zone: "America/Edmonton",
      }).toFormat("EEEE, MMMM d, yyyy");
    } catch {
      return input.startDate;
    }
  })();

  const subject = `Welcome to the Workplaces Business Building Program, ${firstName}`;

  const html = shell({
    preheader: `${input.senderName} has set up your engagement on The Builder — accept your invitation to get started.`,
    heading: "Welcome to the program.",
    accent: "#E87722", // Safety Vest Orange — happy moment, full warm accent
    buttonHref: input.acceptUrl,
    buttonLabel: "Accept your invitation",
    bodyHtml: `
      <p style="margin:0 0 18px 0;font-size:17px;">Hi ${escapeHtml(firstName)},</p>

      <p style="margin:0 0 18px 0;">
        I'm thrilled you've decided to join us. This email is your formal
        welcome to the <strong>${escapeHtml(programLabel)}</strong> —
        and the start of the work we're going to do together.
      </p>

      <p style="margin:0 0 24px 0;padding:16px 20px;background:#F5F1E8;border-left:4px solid #E87722;font-size:15px;line-height:1.55;">
        The Business Building Program is a structured Business Building engagement
        designed to move two needles in your business: <strong>top-line
        revenue</strong> and <strong>margin</strong>. Twice-monthly
        sessions, a focused set of deliverables (SOPs, org charts,
        financial dashboards, hiring frameworks, business plans, and
        more), and a private portal where every piece of the work lives
        in one place.
      </p>

      <p style="margin:0 0 14px 0;font-size:17px;font-weight:700;color:#2E4057;">
        What happens next
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px 0;width:100%;">
        <tr>
          <td style="padding:0 0 14px 0;vertical-align:top;width:40px;">
            <div style="width:32px;height:32px;border-radius:9999px;background:#E87722;color:#FFFFFF;font-weight:700;font-size:14px;text-align:center;line-height:32px;">1</div>
          </td>
          <td style="padding:0 0 14px 0;vertical-align:top;font-size:15px;line-height:1.55;">
            <strong>Accept your invitation</strong> with the button below.
            You'll set up your secure login and land in your private portal.
          </td>
        </tr>
        <tr>
          <td style="padding:0 0 14px 0;vertical-align:top;">
            <div style="width:32px;height:32px;border-radius:9999px;background:#E87722;color:#FFFFFF;font-weight:700;font-size:14px;text-align:center;line-height:32px;">2</div>
          </td>
          <td style="padding:0 0 14px 0;vertical-align:top;font-size:15px;line-height:1.55;">
            <strong>Take a quick tour</strong> of the portal — action items,
            sessions, documents, communications, and the Soul File. Two
            minutes, fully optional, dismissable any time.
          </td>
        </tr>
        <tr>
          <td style="padding:0;vertical-align:top;">
            <div style="width:32px;height:32px;border-radius:9999px;background:#E87722;color:#FFFFFF;font-weight:700;font-size:14px;text-align:center;line-height:32px;">3</div>
          </td>
          <td style="padding:0;vertical-align:top;font-size:15px;line-height:1.55;">
            <strong>Our first Business Building Session</strong> is on
            <strong>${escapeHtml(startDateLabel)}</strong>. I'll send the
            calendar invite separately. Until then, browse the portal —
            it's yours.
          </td>
        </tr>
      </table>

      <p style="margin:0 0 8px 0;">
        Anything you need before our first session, just reply to this
        email — I see them all.
      </p>

      <p style="margin:0 0 4px 0;">Talk soon,</p>
      <p style="margin:0 0 2px 0;font-weight:700;font-size:16px;color:#2E4057;">${escapeHtml(senderFirstName)}</p>
      <p style="margin:0;font-size:13px;color:#666666;">
        ${escapeHtml(input.senderTitle ?? "Business Builder · Workplaces")}<br>
        <a href="mailto:${escapeHtml(input.senderEmail)}" style="color:#2E4057;text-decoration:underline;">${escapeHtml(input.senderEmail)}</a>
      </p>
    `,
  });

  const text = [
    `Hi ${firstName},`,
    "",
    `I'm thrilled you've decided to join us. This email is your formal welcome to the ${programLabel} — and the start of the work we're going to do together.`,
    "",
    `The Business Building Program is a structured Business Building engagement designed to move two needles in your business: top-line revenue and margin. Twice-monthly sessions, a focused set of deliverables, and a private portal where every piece of the work lives in one place.`,
    "",
    "What happens next:",
    "  1. Accept your invitation with the link below. You'll set up your secure login and land in your private portal.",
    "  2. Take a quick tour of the portal — action items, sessions, documents, communications, the Soul File.",
    `  3. Our first Business Building Session is on ${startDateLabel}. I'll send the calendar invite separately.`,
    "",
    `Accept your invitation: ${input.acceptUrl}`,
    "",
    "Anything you need before our first session, just reply to this email.",
    "",
    "Talk soon,",
    senderFirstName,
    input.senderTitle ?? "Business Builder · Workplaces",
    input.senderEmail,
  ].join("\n");

  return { to: input.to, subject, html, text };
}

/* ------------- client invite: copy to the Business Builder ------------- */

export type ClientInviteCopyEmailInput = {
  to: string; // the Business Builder who sent the invite
  coachName: string;
  clientName: string;
  clientEmail: string;
  engagementName: string;
  engagementUrl: string;
};

/** Sent to the Business Builder as their copy when they invite a client —
 *  so they have a record the invitation went out and a link back to the
 *  workspace. */
export function clientInviteCopyEmail(
  input: ClientInviteCopyEmailInput,
): EmailEnvelope {
  const url = input.engagementUrl.startsWith("http")
    ? input.engagementUrl
    : appUrl() + input.engagementUrl;
  const subject = `Invitation sent to ${input.clientName} (${input.engagementName})`;
  const html = shell({
    preheader: `You invited ${input.clientName} to their portal.`,
    heading: `Invitation sent to ${input.clientName}`,
    bodyHtml: `
      <p style="margin:0 0 12px 0;">Hi ${escapeHtml(input.coachName.split(" ")[0] ?? input.coachName)},</p>
      <p style="margin:0 0 12px 0;">This is your copy — a portal invitation just went out to <strong>${escapeHtml(input.clientName)}</strong> (${escapeHtml(input.clientEmail)}) for <strong>${escapeHtml(input.engagementName)}</strong>.</p>
      <p style="margin:0 0 12px 0;">You'll get another email the moment they accept, with what to do next.</p>
    `,
    buttonHref: url,
    buttonLabel: "Open the workspace",
  });
  const text = [
    `Your copy: a portal invitation was sent to ${input.clientName} (${input.clientEmail}) for ${input.engagementName}.`,
    "",
    `You'll be notified when they accept.`,
    "",
    `Workspace: ${url}`,
  ].join("\n");
  return { to: input.to, subject, html, text };
}

/* ---------- client accepted their invite: notify the Builder ---------- */

export type ClientAcceptedEmailInput = {
  to: string; // the Business Builder
  coachName: string;
  clientName: string;
  engagementName: string;
  engagementUrl: string;
};

/** Sent to the Business Builder when a client accepts their invitation and
 *  lands in the portal — confirmation + the next steps. */
export function clientAcceptedEmail(
  input: ClientAcceptedEmailInput,
): EmailEnvelope {
  const url = input.engagementUrl.startsWith("http")
    ? input.engagementUrl
    : appUrl() + input.engagementUrl;
  const subject = `${input.clientName} accepted — ${input.engagementName} is live`;
  const html = shell({
    preheader: `${input.clientName} joined their portal.`,
    heading: `${input.clientName} is in!`,
    bodyHtml: `
      <p style="margin:0 0 12px 0;">Hi ${escapeHtml(input.coachName.split(" ")[0] ?? input.coachName)},</p>
      <p style="margin:0 0 12px 0;"><strong>${escapeHtml(input.clientName)}</strong> accepted their invitation and now has access to the <strong>${escapeHtml(input.engagementName)}</strong> portal.</p>
      <p style="margin:0 0 8px 0;"><strong>What to do next:</strong></p>
      <ol style="margin:0 0 12px 18px;padding:0;">
        <li style="margin-bottom:4px;">Schedule their first Business Building Session.</li>
        <li style="margin-bottom:4px;">Post a welcome message in their Communication thread.</li>
        <li style="margin-bottom:4px;">Confirm the portal modules they can see.</li>
      </ol>
    `,
    buttonHref: url,
    buttonLabel: "Open the workspace",
    accent: "#E87722",
  });
  const text = [
    `${input.clientName} accepted their invitation and joined the ${input.engagementName} portal.`,
    "",
    "What to do next:",
    "  1. Schedule their first Business Building Session.",
    "  2. Post a welcome message in their Communication thread.",
    "  3. Confirm the portal modules they can see.",
    "",
    `Workspace: ${url}`,
  ].join("\n");
  return { to: input.to, subject, html, text };
}

/* ======================================================================
 * Executive Assistant emails
 *
 * All of these ride the shared `shell` above, so the EA mail looks like
 * the rest of the app's mail rather than a bolted-on second system.
 *
 * House rules for this block, per the build spec: sentence-case navy
 * headings, no em dashes in copy, Canadian spelling, Arial with a
 * sans-serif fallback (Outlook will not load a web font), inline styles
 * only, table-based layout, and a plain-text alternative on every send.
 * Approve actions use `bulletproofButton`, never a styled anchor.
 * ==================================================================== */

const NAVY = "#2E4057";
const ORANGE = "#E87722";
const INK = "#1A1A1A";
const MUTED = "#666666";
const RULE = "#E5E5E5";
const CREAM = "#F5F1E8";

/** Section header plus its rows. Returns "" when there is nothing to
 *  say, so empty sections vanish rather than printing "None". */
function eaSection(
  title: string,
  innerHtml: string,
  opts: { accent?: string; subtitle?: string } = {},
): string {
  if (!innerHtml.trim()) return "";
  const accent = opts.accent ?? NAVY;
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px 0;">
  <tr>
    <td style="padding:0 0 10px 0;border-bottom:2px solid ${accent};">
      <span style="font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;font-size:17px;font-weight:bold;color:${accent};">${escapeHtml(title)}</span>
      ${
        opts.subtitle
          ? `<span style="font-family:Arial,sans-serif;font-size:13px;color:${MUTED};"> ${escapeHtml(opts.subtitle)}</span>`
          : ""
      }
    </td>
  </tr>
  <tr><td style="padding:12px 0 0 0;">${innerHtml}</td></tr>
</table>`;
}

/** One line item: title on the left, a small grey qualifier on the right. */
function eaRow(
  title: string,
  meta: string,
  opts: { accent?: string; note?: string } = {},
): string {
  const accent = opts.accent;
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px 0;border-bottom:1px solid ${RULE};">
  <tr>
    <td style="padding:6px 0;font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:${INK};">
      ${accent ? `<span style="color:${accent};font-weight:bold;">&#9632;</span> ` : ""}${escapeHtml(title)}
      ${meta ? `<br><span style="font-size:12px;color:${MUTED};">${escapeHtml(meta)}</span>` : ""}
      ${
        opts.note
          ? `<br><span style="font-size:12px;color:${ORANGE};font-weight:bold;">${escapeHtml(opts.note)}</span>`
          : ""
      }
    </td>
  </tr>
</table>`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "no date";
  return DateTime.fromISO(iso, { zone: "America/Edmonton" }).toFormat("ccc d LLL");
}

/** "in_progress" reads badly in a briefing. */
function humanStatus(s: string): string {
  return s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/* --------------------------- daily digest --------------------------- */

export type DailyDigestEmailInput = {
  to: string;
  payload: DigestPayload;
};

/**
 * The 07:00 briefing. Ordered by what changes Bruce's next hour:
 * what is happening today, what has already slipped, what the assistant
 * proposes to do about it, then the wider state of the book.
 */
export function dailyDigestEmail(input: DailyDigestEmailInput): EmailEnvelope {
  const p = input.payload;
  const firstName = p.recipientName.split(" ")[0] ?? p.recipientName;
  const dateLabel = DateTime.fromISO(p.forDate, {
    zone: "America/Edmonton",
  }).toFormat("cccc d LLLL");

  const totalOverdue = p.myItems.overdue.length;
  const parts: string[] = [];

  parts.push(
    `<p style="margin:0 0 20px 0;font-family:Arial,sans-serif;font-size:15px;">Good morning ${escapeHtml(firstName)}. Here is ${escapeHtml(dateLabel)}.</p>`,
  );

  /* Today's sessions, with what to walk in knowing. */
  parts.push(
    eaSection(
      "Today",
      p.todaysSessions
        .map((s) => {
          const commitments = s.openCommitments.length
            ? `<ul style="margin:8px 0 0 0;padding-left:18px;font-family:Arial,sans-serif;font-size:13px;color:${INK};">${s.openCommitments
                .map(
                  (c) =>
                    `<li style="margin:0 0 4px 0;">${escapeHtml(c.title)}${
                      c.assigneeName ? ` <span style="color:${MUTED};">(${escapeHtml(c.assigneeName)})</span>` : ""
                    }</li>`,
                )
                .join("")}</ul>`
            : `<p style="margin:8px 0 0 0;font-family:Arial,sans-serif;font-size:13px;color:${MUTED};">Nothing open from last time.</p>`;
          return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;background:${CREAM};">
  <tr><td style="padding:14px 16px;font-family:Arial,sans-serif;">
    <div style="font-size:15px;font-weight:bold;color:${NAVY};">${escapeHtml(s.engagementLabel)} at ${escapeHtml(s.whenLabel)}</div>
    <div style="font-size:12px;color:${MUTED};margin-top:2px;">${escapeHtml(humanStatus(s.type))}${
      s.previousSessionAt ? ` &middot; last session ${escapeHtml(fmtDate(s.previousSessionAt))}` : " &middot; first session"
    }</div>
    <div style="font-size:12px;color:${MUTED};margin-top:10px;font-weight:bold;text-transform:uppercase;letter-spacing:0.06em;">Still open</div>
    ${commitments}
    ${
      s.proposedAgenda && s.proposedAgenda.items.length > 0
        ? `
    <div style="margin-top:16px;padding-top:14px;border-top:1px solid ${RULE};">
      <div style="font-size:12px;color:${NAVY};font-weight:bold;text-transform:uppercase;letter-spacing:0.06em;">Suggested agenda</div>
      <ol style="margin:8px 0 12px 0;padding-left:18px;font-family:Arial,sans-serif;font-size:13px;color:${INK};line-height:1.6;">
        ${s.proposedAgenda.items
          .map(
            (a) =>
              `<li style="margin:0 0 6px 0;">${escapeHtml(a.title)}${
                a.body
                  ? `<br><span style="color:${MUTED};font-size:12px;">${escapeHtml(a.body)}</span>`
                  : ""
              }</li>`,
          )
          .join("")}
      </ol>
      ${bulletproofButton({
        href: s.proposedAgenda.approveUrl,
        label: "Add to the agenda",
        width: 210,
      })}
      <div style="font-size:11px;color:${MUTED};margin-top:8px;">Nothing is on their agenda until you tap. You can edit or delete any of it afterwards.</div>
    </div>`
        : ""
    }
  </td></tr>
</table>`;
        })
        .join(""),
      { subtitle: "who you are seeing, and what is still open" },
    ),
  );

  /* Escalations, before anything else that competes for attention. */
  parts.push(
    eaSection(
      "Slipping",
      p.escalations
        .map((e) =>
          eaRow(
            e.title,
            `${e.engagementLabel} &middot; block ended ${fmtDate(e.blockEndedAt)}`,
            { accent: ORANGE, note: e.notice },
          ),
        )
        .join(""),
      { accent: ORANGE, subtitle: "blocks that passed with the work still open" },
    ),
  );

  /* Proposed blocks. The one section with buttons. */
  parts.push(
    eaSection(
      "Time I have found for you",
      p.proposedBlocks
        .map(
          (b) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px 0;border:1px solid ${RULE};">
  <tr><td style="padding:14px 16px;font-family:Arial,sans-serif;">
    <div style="font-size:14px;font-weight:bold;color:${INK};">${escapeHtml(b.title)}</div>
    <div style="font-size:12px;color:${MUTED};margin:2px 0 12px 0;">${escapeHtml(b.engagementLabel)} &middot; ${escapeHtml(b.whenLabel)}${
      b.rescheduleCount > 0 ? ` &middot; attempt ${b.rescheduleCount + 1}` : ""
    }</div>
    ${bulletproofButton({ href: b.approveUrl, label: "Put it on my calendar", width: 240 })}
  </td></tr>
</table>`,
        )
        .join(""),
      { subtitle: "one tap places the event, nothing is booked until you do" },
    ),
  );

  /* My items. */
  const myBuckets = [
    { label: "Overdue", items: p.myItems.overdue, accent: ORANGE },
    { label: "Due today", items: p.myItems.today, accent: NAVY },
    { label: "Due this week", items: p.myItems.thisWeek, accent: NAVY },
  ];
  const myHtml = myBuckets
    .filter((b) => b.items.length > 0)
    .map(
      (b) => `
<div style="font-family:Arial,sans-serif;font-size:12px;font-weight:bold;color:${b.accent};text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px 0;">${escapeHtml(b.label)} (${b.items.length})</div>
${b.items
  .map((i) =>
    eaRow(
      i.title,
      `${i.engagementLabel} &middot; ${i.daysOverdue !== null ? `${i.daysOverdue} day${i.daysOverdue === 1 ? "" : "s"} overdue` : fmtDate(i.dueDate)}`,
      { accent: i.daysOverdue !== null ? ORANGE : undefined },
    ),
  )
  .join("")}
<div style="height:12px;"></div>`,
    )
    .join("");
  parts.push(eaSection("Your commitments", myHtml));

  /* Sessions in the next seven days (today's already shown above). */
  const laterSessions = p.upcomingSessions.filter(
    (s) => !p.todaysSessions.some((t) => t.id === s.id),
  );
  parts.push(
    eaSection(
      "Next seven days",
      laterSessions
        .map((s) => eaRow(`${s.engagementLabel}`, `${s.whenLabel} &middot; ${humanStatus(s.type)}`))
        .join(""),
    ),
  );

  /* No next step booked.
   *
   * Kept in the DAILY rather than moved to Friday with the other
   * state-of-the-book sections. It is usually two lines, and it is the
   * one item on that list you act on the same morning: a conversation
   * that ended without a date decays fast, and Friday afternoon is three
   * days too late to ring somebody back. */
  parts.push(
    eaSection(
      "No next step booked",
      p.prospectsWithoutNextStep
        .map((pr) =>
          eaRow(
            pr.companyName,
            `${pr.contactName ?? "no contact name"} &middot; ${humanStatus(pr.status)} &middot; last touched ${fmtDate(pr.lastActivityAt)}`,
            { accent: ORANGE },
          ),
        )
        .join(""),
      { accent: ORANGE, subtitle: "conversations that ended without a date" },
    ),
  );

  const anyContent = parts.slice(1).some((s) => s.trim().length > 0);
  if (!anyContent) {
    parts.push(
      `<p style="margin:0;font-family:Arial,sans-serif;font-size:15px;color:${MUTED};">Nothing needs you this morning. No overdue work, no sessions today, nothing waiting on a date.</p>`,
    );
  } else {
    // The daily is deliberately only what you act on today. Deliverable
    // states, what clients owe, and quiet engagements are a weekly read,
    // not a 7am one, so they moved to the Friday rollup. The pointer
    // stops that looking like something quietly went missing.
    parts.push(
      `<p style="margin:8px 0 0 0;font-family:Arial,sans-serif;font-size:12px;color:${MUTED};line-height:1.6;">Deliverable states, what your clients owe you, and any engagement gone quiet are in Friday's rollup.</p>`,
    );
  }

  const subject =
    totalOverdue > 0
      ? `Your day: ${totalOverdue} overdue, ${p.todaysSessions.length} session${p.todaysSessions.length === 1 ? "" : "s"} today`
      : `Your day: ${p.todaysSessions.length} session${p.todaysSessions.length === 1 ? "" : "s"} today`;

  const html = shell({
    preheader: `${totalOverdue} overdue, ${p.myItems.today.length} due today, ${p.proposedBlocks.length} block${p.proposedBlocks.length === 1 ? "" : "s"} proposed.`,
    heading: "Your morning briefing",
    bodyHtml: parts.join(""),
    buttonHref: `${appUrl()}/business-builder`,
    buttonLabel: "Open the console",
    accent: totalOverdue > 0 ? ORANGE : NAVY,
  });

  /* ---- plain text alternative ---- */
  const t: string[] = [`Good morning ${firstName}. Here is ${dateLabel}.`, ""];
  if (p.todaysSessions.length) {
    t.push("TODAY");
    for (const s of p.todaysSessions) {
      t.push(`  ${s.engagementLabel} at ${s.whenLabel} (${humanStatus(s.type)})`);
      for (const c of s.openCommitments) {
        t.push(`    still open: ${c.title}${c.assigneeName ? ` (${c.assigneeName})` : ""}`);
      }
      if (s.proposedAgenda && s.proposedAgenda.items.length > 0) {
        t.push("    Suggested agenda:");
        for (const a of s.proposedAgenda.items) {
          t.push(`      - ${a.title}${a.body ? ` (${a.body})` : ""}`);
        }
        t.push(`      Add to the agenda: ${s.proposedAgenda.approveUrl}`);
      }
    }
    t.push("");
  }
  if (p.escalations.length) {
    t.push("SLIPPING");
    for (const e of p.escalations) t.push(`  ${e.title} (${e.engagementLabel}) - ${e.notice}`);
    t.push("");
  }
  if (p.proposedBlocks.length) {
    t.push("TIME I HAVE FOUND FOR YOU");
    for (const b of p.proposedBlocks) {
      t.push(`  ${b.title} (${b.engagementLabel})`);
      t.push(`    ${b.whenLabel}`);
      t.push(`    Approve: ${b.approveUrl}`);
    }
    t.push("");
  }
  for (const b of myBuckets) {
    if (!b.items.length) continue;
    t.push(`${b.label.toUpperCase()} (${b.items.length})`);
    for (const i of b.items) {
      t.push(
        `  ${i.title} (${i.engagementLabel}) - ${i.daysOverdue !== null ? `${i.daysOverdue} days overdue` : fmtDate(i.dueDate)}`,
      );
    }
    t.push("");
  }
  if (laterSessions.length) {
    t.push("NEXT SEVEN DAYS");
    for (const s of laterSessions) t.push(`  ${s.engagementLabel} - ${s.whenLabel}`);
    t.push("");
  }
  if (p.prospectsWithoutNextStep.length) {
    t.push("NO NEXT STEP BOOKED");
    for (const pr of p.prospectsWithoutNextStep) {
      t.push(`  ${pr.companyName} - ${humanStatus(pr.status)}, last touched ${fmtDate(pr.lastActivityAt)}`);
    }
    t.push("");
  }
  t.push(`Open the console: ${appUrl()}/business-builder`);

  return { to: input.to, subject, html, text: t.join("\n") };
}

/* ---------------------- session recap: approval ---------------------- */

export type RecapApprovalEmailInput = {
  to: string;
  recipientName: string;
  clientLabel: string;
  sessionWhen: string;
  recapHtml: string;
  approveUrl: string;
  reviewUrl: string;
};

/**
 * Sent to Bruce, not the client. Carries the full recap so it can be
 * read and approved from a phone without opening the app, because an
 * unapproved recap ages badly.
 */
export function sessionRecapApprovalEmail(
  input: RecapApprovalEmailInput,
): EmailEnvelope {
  const firstName = input.recipientName.split(" ")[0] ?? input.recipientName;
  const bodyHtml = `
<p style="margin:0 0 14px 0;font-family:Arial,sans-serif;font-size:15px;">Hi ${escapeHtml(firstName)}, here is the draft recap for <strong>${escapeHtml(input.clientLabel)}</strong> (${escapeHtml(input.sessionWhen)}).</p>
<p style="margin:0 0 18px 0;font-family:Arial,sans-serif;font-size:14px;color:${MUTED};">Nothing has been sent. Approving emails it to the client contacts and files it on their portal thread as a permanent record.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px 0;border:1px solid ${RULE};background:#FFFFFF;">
  <tr><td style="padding:18px 20px;">${input.recapHtml}</td></tr>
</table>
${bulletproofButton({ href: input.approveUrl, label: "Approve and send to client", width: 280 })}
<p style="margin:14px 0 0 0;font-family:Arial,sans-serif;font-size:13px;color:${MUTED};">Needs an edit first? <a href="${escapeHtml(input.reviewUrl)}" style="color:${NAVY};">Open it in the console</a>.</p>`;

  const html = shell({
    preheader: `Draft recap for ${input.clientLabel}. Nothing sent yet.`,
    heading: "Recap ready for your approval",
    bodyHtml,
    buttonHref: input.reviewUrl,
    buttonLabel: "Open in the console",
  });

  const text = [
    `Draft recap for ${input.clientLabel} (${input.sessionWhen}).`,
    "",
    "Nothing has been sent. Approving emails it to the client contacts and files it on their portal thread.",
    "",
    `Approve and send: ${input.approveUrl}`,
    `Edit first: ${input.reviewUrl}`,
  ].join("\n");

  return {
    to: input.to,
    subject: `Approve: ${input.clientLabel} session recap`,
    html,
    text,
  };
}

/* ----------------------- session recap: client ----------------------- */

export type RecapClientEmailInput = {
  to: string;
  subject: string;
  recapHtml: string;
  recapText: string;
  portalUrl: string;
};

/** The recap as the client receives it, once Bruce has approved it. */
export function sessionRecapClientEmail(
  input: RecapClientEmailInput,
): EmailEnvelope {
  const html = shell({
    preheader: "Your session recap, decisions, and what happens next.",
    heading: "Your session recap",
    bodyHtml: input.recapHtml,
    buttonHref: input.portalUrl,
    buttonLabel: "Open your portal",
  });
  return {
    to: input.to,
    subject: input.subject,
    html,
    text: `${input.recapText}\n\nOpen your portal: ${input.portalUrl}`,
  };
}

/* ------------------------ client overdue nudge ------------------------ */

export type ClientNudgeEmailInput = {
  to: string;
  recipientName: string;
  items: { title: string; dueDate: string | null; daysOverdue: number | null }[];
  portalUrl: string;
};

/**
 * Weekly nudge to the CLIENT about their own overdue commitments.
 *
 * This exists so that chasing is not done by hand. The tone is a
 * reminder between partners, not a demand: these are commitments they
 * made, and the email says so plainly without scolding.
 */
export function clientOverdueNudgeEmail(
  input: ClientNudgeEmailInput,
): EmailEnvelope {
  const firstName = input.recipientName.split(" ")[0] ?? input.recipientName;
  const rows = input.items
    .map((i) =>
      eaRow(
        i.title,
        i.daysOverdue !== null
          ? `${i.daysOverdue} day${i.daysOverdue === 1 ? "" : "s"} past its date`
          : `due ${fmtDate(i.dueDate)}`,
        { accent: ORANGE },
      ),
    )
    .join("");

  const bodyHtml = `
<p style="margin:0 0 14px 0;font-family:Arial,sans-serif;font-size:15px;">Hi ${escapeHtml(firstName)},</p>
<p style="margin:0 0 18px 0;font-family:Arial,sans-serif;font-size:15px;">A few commitments from your sessions are past their date. Nothing here is a problem yet, but they are the ones holding up the next step.</p>
${rows}
<p style="margin:18px 0 0 0;font-family:Arial,sans-serif;font-size:14px;color:${MUTED};">If a date needs to move, change it in the portal or raise it at the next session. A moved date is fine. A silent one is not.</p>`;

  const html = shell({
    preheader: `${input.items.length} commitment${input.items.length === 1 ? "" : "s"} past their date.`,
    heading: "A few open commitments",
    bodyHtml,
    buttonHref: input.portalUrl,
    buttonLabel: "Open your portal",
    accent: ORANGE,
  });

  const text = [
    `Hi ${firstName},`,
    "",
    "A few commitments from your sessions are past their date:",
    "",
    ...input.items.map(
      (i) =>
        `  - ${i.title}${i.daysOverdue !== null ? ` (${i.daysOverdue} days past its date)` : ""}`,
    ),
    "",
    `Open your portal: ${input.portalUrl}`,
  ].join("\n");

  return {
    to: input.to,
    subject: `${input.items.length} open commitment${input.items.length === 1 ? "" : "s"} from your sessions`,
    html,
    text,
  };
}

/* --------------------------- Friday rollup --------------------------- */

export type FridayRollupEmailInput = {
  to: string;
  recipientName: string;
  weekLabel: string;
  shipped: {
    title: string;
    engagementLabel: string;
    revenueImpact: boolean;
    marginImpact: boolean;
  }[];
  slipped: {
    title: string;
    engagementLabel: string;
    daysOverdue: number | null;
    revenueImpact: boolean;
    marginImpact: boolean;
  }[];
  /** State of the book. Moved here out of the 7am briefing, which is
   *  deliberately only what you act on today. */
  deliverablesByStatus: DigestPayload["deliverablesByStatus"];
  deliverablesPastTarget: DigestPayload["deliverablesPastTarget"];
  clientOverdue: DigestPayload["clientOverdue"];
  quietEngagements: DigestPayload["quietEngagements"];
  /** Hours spent per engagement, and what they are earning. */
  engagementHours: EngagementHours[];
  /** Heartbeat for the assistant's own background jobs. Bottom of the
   *  email, because it is the section you should be able to ignore. */
  heartbeats: JobHeartbeat[];
};

/**
 * Hours per engagement, worst rate first.
 *
 * The number nobody calculates by hand. Sessions are visible and the fee
 * is visible, but until they are divided the engagement that drifted
 * from two hours a fortnight to a day a week looks exactly like the one
 * that did not.
 *
 * The rate errs low on purpose: only time the system can actually see is
 * counted, so email, prep, and thinking in the car are all missing. A
 * rate that looks thin here is thinner in life.
 */
function hoursTable(rows: EngagementHours[]): string {
  if (rows.length === 0) return "";

  const cell =
    "padding:7px 8px;font-family:Arial,sans-serif;font-size:12px;vertical-align:top;border-bottom:1px solid " +
    RULE +
    ";";
  const head = `padding:7px 8px;font-family:Arial,sans-serif;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.06em;color:${MUTED};text-align:left;border-bottom:1px solid ${RULE};`;

  // Anything under this reads as a warning. Not a hard rule, a prompt to
  // look: an Accelerator running below it is either mispriced or
  // over-served.
  const THIN_RATE = 150;

  const body = rows
    .map((r) => {
      const thin = r.toDateHourlyRate !== null && r.toDateHourlyRate < THIN_RATE;
      const colour = thin ? "#C0392B" : INK;
      const rate =
        r.toDateHourlyRate === null
          ? r.monthlyFeeCents === null
            ? "no fee set"
            : "no hours yet"
          : `$${r.toDateHourlyRate.toLocaleString("en-CA")}/hr`;
      return `
<tr>
  <td style="${cell}color:${colour};font-weight:${thin ? "bold" : "normal"};">
    ${escapeHtml(r.engagementLabel)}
    <div style="font-size:10px;color:${MUTED};font-weight:normal;">${r.monthsElapsed} month${r.monthsElapsed === 1 ? "" : "s"} in</div>
  </td>
  <td style="${cell}text-align:right;color:${INK};">${r.periodTotalHours}</td>
  <td style="${cell}text-align:right;color:${INK};">${r.toDateTotalHours}</td>
  <td style="${cell}text-align:right;color:${colour};font-weight:${thin ? "bold" : "normal"};">${escapeHtml(rate)}</td>
</tr>`;
    })
    .join("");

  const anyThin = rows.some(
    (r) => r.toDateHourlyRate !== null && r.toDateHourlyRate < THIN_RATE,
  );

  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${RULE};border-collapse:collapse;">
  <tr>
    <th style="${head}">Client</th>
    <th style="${head}text-align:right;">This week</th>
    <th style="${head}text-align:right;">To date</th>
    <th style="${head}text-align:right;">Effective rate</th>
  </tr>
  ${body}
</table>
<p style="margin:10px 0 0 0;font-family:Arial,sans-serif;font-size:11px;color:${MUTED};line-height:1.6;">
  Hours count sessions actually held plus focus blocks that have passed. Email, prep, and thinking time are not in here, so the real rate is lower than shown.${
    anyThin
      ? ` <span style="color:#C0392B;font-weight:bold;">Anything in red is under $${THIN_RATE}/hr and is either mispriced or over-served.</span>`
      : ""
  }
</p>`;
}

/**
 * The heartbeat table.
 *
 * Bottom of the rollup and deliberately plain: this is the section that
 * should be boring every week. Its whole job is to make the ONE week it
 * is not boring impossible to miss, which is why a stale job goes red
 * and carries its last error inline rather than asking you to go and
 * look somewhere else.
 *
 * A job that has never run at all is stale by definition. That is the
 * case that matters most, because a job which never fired writes no rows
 * and would otherwise be invisible.
 */
function heartbeatTable(beats: JobHeartbeat[]): string {
  if (beats.length === 0) return "";

  const cell = "padding:7px 8px;font-family:Arial,sans-serif;font-size:12px;vertical-align:top;";
  const head = `padding:7px 8px;font-family:Arial,sans-serif;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.06em;color:${MUTED};text-align:left;border-bottom:1px solid ${RULE};`;

  const rows = beats
    .map((b) => {
      const colour = b.stale ? "#C0392B" : INK;
      const weight = b.stale ? "bold" : "normal";
      const lastRun = b.lastSuccessAt
        ? DateTime.fromJSDate(b.lastSuccessAt, {
            zone: "America/Edmonton",
          }).toFormat("ccc d LLL, h:mm a")
        : "never";
      const did =
        b.lastSuccessItems === null
          ? "&mdash;"
          : `${b.lastSuccessItems}`;
      return `
<tr>
  <td style="${cell}color:${colour};font-weight:${weight};border-bottom:1px solid ${RULE};">
    ${escapeHtml(b.label)}
    <div style="font-size:10px;color:${MUTED};font-weight:normal;">${escapeHtml(b.cadence)}</div>
  </td>
  <td style="${cell}color:${colour};font-weight:${weight};border-bottom:1px solid ${RULE};">${escapeHtml(lastRun)}</td>
  <td style="${cell}color:${colour};font-weight:${weight};border-bottom:1px solid ${RULE};text-align:right;">${did}</td>
</tr>${
        b.stale
          ? `
<tr>
  <td colspan="3" style="padding:0 8px 10px 8px;font-family:Arial,sans-serif;font-size:11px;color:#C0392B;line-height:1.5;border-bottom:1px solid ${RULE};">
    ${escapeHtml(
      b.lastError
        ? `Last error: ${b.lastError}`
        : "No successful run in over a week, and no error recorded. The job may not be firing at all.",
    )}
  </td>
</tr>`
          : ""
      }`;
    })
    .join("");

  const anyStale = beats.some((b) => b.stale);

  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${RULE};border-collapse:collapse;">
  <tr>
    <th style="${head}">Job</th>
    <th style="${head}">Last worked</th>
    <th style="${head}text-align:right;">Did</th>
  </tr>
  ${rows}
</table>
<p style="margin:10px 0 0 0;font-family:Arial,sans-serif;font-size:11px;color:${anyStale ? "#C0392B" : MUTED};line-height:1.6;">
  ${
    anyStale
      ? "Something in red has not worked in over a week. That usually means a disconnected Google account or a job that has stopped firing."
      : "Everything has run. A zero in the last column is a quiet week, not a fault."
  }
</p>`;
}

/**
 * What shipped, what slipped, both tagged against the quality gate.
 *
 * This is the one report that answers the gate directly: every item is
 * marked for whether it moves top line, protects margin, or neither.
 * The "neither" count is the interesting number.
 */
export function fridayRollupEmail(input: FridayRollupEmailInput): EmailEnvelope {
  const firstName = input.recipientName.split(" ")[0] ?? input.recipientName;
  const tag = (rev: boolean, mar: boolean): string => {
    if (rev && mar) return "top line + margin";
    if (rev) return "top line";
    if (mar) return "margin";
    return "neither";
  };

  const shippedHtml = input.shipped
    .map((s) => eaRow(s.title, `${s.engagementLabel} &middot; ${tag(s.revenueImpact, s.marginImpact)}`))
    .join("");
  const slippedHtml = input.slipped
    .map((s) =>
      eaRow(
        s.title,
        `${s.engagementLabel} &middot; ${tag(s.revenueImpact, s.marginImpact)}${
          s.daysOverdue !== null ? ` &middot; ${s.daysOverdue} days late` : ""
        }`,
        { accent: ORANGE },
      ),
    )
    .join("");

  const untagged =
    input.shipped.filter((s) => !s.revenueImpact && !s.marginImpact).length +
    input.slipped.filter((s) => !s.revenueImpact && !s.marginImpact).length;

  /* ---- state of the book: what the daily deliberately leaves out ---- */

  const delivHtml =
    input.deliverablesByStatus
      .map(
        (g) => `
<div style="font-family:Arial,sans-serif;font-size:12px;font-weight:bold;color:${NAVY};text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px 0;">${escapeHtml(humanStatus(g.status))} (${g.items.length})</div>
${g.items
  .map((d) =>
    eaRow(
      d.title,
      `${d.engagementLabel} &middot; ${d.daysInState} day${d.daysInState === 1 ? "" : "s"} without a change`,
      { accent: d.daysPastTarget !== null ? ORANGE : undefined },
    ),
  )
  .join("")}
<div style="height:12px;"></div>`,
      )
      .join("") +
    (input.deliverablesPastTarget.length
      ? `
<div style="font-family:Arial,sans-serif;font-size:12px;font-weight:bold;color:${ORANGE};text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px 0;">Past the promised date (${input.deliverablesPastTarget.length})</div>
${input.deliverablesPastTarget
  .map((d) =>
    eaRow(d.title, `${d.engagementLabel} &middot; promised ${fmtDate(d.targetDate)}`, {
      accent: ORANGE,
      note: `${d.daysPastTarget} day${d.daysPastTarget === 1 ? "" : "s"} late`,
    }),
  )
  .join("")}`
      : "");

  const clientHtml = input.clientOverdue
    .map((i) =>
      eaRow(
        i.title,
        `${i.engagementLabel} &middot; ${i.assigneeName ?? "unassigned"} &middot; ${i.daysOverdue} day${i.daysOverdue === 1 ? "" : "s"} overdue`,
      ),
    )
    .join("");

  const quietHtml = input.quietEngagements
    .map((q) =>
      eaRow(
        q.engagementLabel,
        `${q.quietDays} days with no session and no movement on any item`,
        { accent: ORANGE },
      ),
    )
    .join("");

  const bodyHtml = `
<p style="margin:0 0 20px 0;font-family:Arial,sans-serif;font-size:15px;">Hi ${escapeHtml(firstName)}, here is ${escapeHtml(input.weekLabel)}.</p>
${eaSection(`Shipped (${input.shipped.length})`, shippedHtml)}
${eaSection(`Slipped (${input.slipped.length})`, slippedHtml, { accent: ORANGE })}
${
  untagged > 0
    ? `<p style="margin:0 0 28px 0;font-family:Arial,sans-serif;font-size:14px;color:${ORANGE};"><strong>${untagged}</strong> item${untagged === 1 ? "" : "s"} moved neither top line nor margin. Worth asking why ${untagged === 1 ? "it was" : "they were"} on the list.</p>`
    : `<p style="margin:0 0 28px 0;font-family:Arial,sans-serif;font-size:14px;color:${MUTED};">Every item this week moved top line, margin, or both.</p>`
}
${eaSection("Deliverables in flight", delivHtml)}
${eaSection("Waiting on the client", clientHtml, { subtitle: "they get their own nudge on Monday, this is so you know" })}
${eaSection("Gone quiet", quietHtml, { accent: ORANGE, subtitle: "the earliest signal of a renewal at risk" })}
${eaSection("Hours and what they earn", hoursTable(input.engagementHours), { subtitle: "worst rate first" })}
${eaSection("Your assistant", heartbeatTable(input.heartbeats), { subtitle: "proof it actually ran" })}`;

  const html = shell({
    preheader: `${input.shipped.length} shipped, ${input.slipped.length} slipped.`,
    heading: "Your week",
    bodyHtml,
    buttonHref: `${appUrl()}/business-builder`,
    buttonLabel: "Open the console",
  });

  const text = [
    `Hi ${firstName}, here is ${input.weekLabel}.`,
    "",
    `SHIPPED (${input.shipped.length})`,
    ...input.shipped.map(
      (s) => `  ${s.title} (${s.engagementLabel}) - ${tag(s.revenueImpact, s.marginImpact)}`,
    ),
    "",
    `SLIPPED (${input.slipped.length})`,
    ...input.slipped.map(
      (s) => `  ${s.title} (${s.engagementLabel}) - ${tag(s.revenueImpact, s.marginImpact)}`,
    ),
    "",
    untagged > 0
      ? `${untagged} item(s) moved neither top line nor margin.`
      : "Every item this week moved top line, margin, or both.",
    "",
    ...input.deliverablesByStatus.flatMap((g) => [
      `DELIVERABLES / ${humanStatus(g.status).toUpperCase()} (${g.items.length})`,
      ...g.items.map(
        (d) => `  ${d.title} (${d.engagementLabel}) - ${d.daysInState} days without a change`,
      ),
      "",
    ]),
    ...(input.deliverablesPastTarget.length
      ? [
          "PAST THE PROMISED DATE",
          ...input.deliverablesPastTarget.map(
            (d) => `  ${d.title} (${d.engagementLabel}) - ${d.daysPastTarget} days late`,
          ),
          "",
        ]
      : []),
    ...(input.clientOverdue.length
      ? [
          "WAITING ON THE CLIENT",
          ...input.clientOverdue.map(
            (i) =>
              `  ${i.title} (${i.engagementLabel}) - ${i.assigneeName ?? "unassigned"}, ${i.daysOverdue} days overdue`,
          ),
          "",
        ]
      : []),
    ...(input.quietEngagements.length
      ? [
          "GONE QUIET",
          ...input.quietEngagements.map(
            (q) => `  ${q.engagementLabel} - ${q.quietDays} days with no activity`,
          ),
          "",
        ]
      : []),
    ...(input.engagementHours.length
      ? [
          "HOURS AND WHAT THEY EARN (worst rate first)",
          ...input.engagementHours.map((r) => {
            const rate =
              r.toDateHourlyRate === null
                ? r.monthlyFeeCents === null
                  ? "no fee set"
                  : "no hours yet"
                : `$${r.toDateHourlyRate}/hr`;
            return `  ${r.engagementLabel} - ${r.periodTotalHours}h this week, ${r.toDateTotalHours}h to date, ${rate}`;
          }),
          "",
        ]
      : []),
    "YOUR ASSISTANT",
    ...input.heartbeats.map((b) => {
      const lastRun = b.lastSuccessAt
        ? DateTime.fromJSDate(b.lastSuccessAt, {
            zone: "America/Edmonton",
          }).toFormat("ccc d LLL, h:mm a")
        : "never";
      const flag = b.stale ? "  [!] " : "  ";
      const err = b.stale
        ? `\n        ${b.lastError ? `Last error: ${b.lastError}` : "No successful run in over a week, and no error recorded."}`
        : "";
      return `${flag}${b.label} - last worked ${lastRun}, did ${b.lastSuccessItems ?? 0}${err}`;
    }),
  ].join("\n");

  return {
    to: input.to,
    subject: `Your week: ${input.shipped.length} shipped, ${input.slipped.length} slipped`,
    html,
    text,
  };
}
