/**
 * The little HTML pages the approve links land on.
 *
 * Deliberately standalone markup rather than a Next page: this route is
 * reached with no session, often from a phone's mail app, and it must
 * render instantly and identically whether or not the app's CSS ever
 * loads. Brand colours are inlined; there is no JavaScript.
 */

const INK = "#1A1A1A";
const NAVY = "#2E4057";
const ORANGE = "#E87722";
const CREAM = "#F5F1E8";
const MUTED = "#666666";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function page(inner: string, title: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;color:${INK};">
  <div style="max-width:560px;margin:0 auto;padding:48px 20px;">
    <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${MUTED};font-weight:700;margin-bottom:24px;">
      The Builder &middot; By Workplaces
    </div>
    <div style="background:#FFFFFF;border:1px solid #CCCCCC;border-radius:16px;padding:32px 28px;">
      ${inner}
    </div>
  </div>
</body>
</html>`;
}

/** The confirm step. A POST form, so a link prefetch cannot fire it. */
export function confirmPage(args: {
  heading: string;
  detail: string;
  buttonLabel: string;
  /** Rendered above the button when there is more to read (a recap). */
  previewHtml?: string;
}): string {
  return page(
    `
<h1 style="margin:0 0 12px 0;font-size:24px;line-height:1.25;color:${NAVY};">${esc(args.heading)}</h1>
<p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;">${esc(args.detail)}</p>
${
  args.previewHtml
    ? `<div style="border:1px solid #E5E5E5;border-radius:8px;padding:16px;margin:0 0 24px 0;max-height:420px;overflow:auto;font-size:14px;line-height:1.6;">${args.previewHtml}</div>`
    : ""
}
<form method="POST">
  <button type="submit" style="display:block;width:100%;background:${NAVY};color:#FFFFFF;border:0;border-radius:9999px;padding:16px 24px;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit;">
    ${esc(args.buttonLabel)}
  </button>
</form>
<p style="margin:18px 0 0 0;font-size:13px;color:${MUTED};line-height:1.5;">
  Nothing has happened yet. This link works once, and expires 72 hours after it was sent.
</p>`,
    args.heading,
  );
}

export function successPage(heading: string, detail: string): string {
  return page(
    `
<div style="font-size:32px;line-height:1;margin:0 0 12px 0;">&#10003;</div>
<h1 style="margin:0 0 12px 0;font-size:24px;line-height:1.25;color:${NAVY};">${esc(heading)}</h1>
<p style="margin:0;font-size:15px;line-height:1.6;">${esc(detail)}</p>`,
    heading,
  );
}

export function errorPage(heading: string, detail: string): string {
  return page(
    `
<h1 style="margin:0 0 12px 0;font-size:24px;line-height:1.25;color:${ORANGE};">${esc(heading)}</h1>
<p style="margin:0;font-size:15px;line-height:1.6;">${esc(detail)}</p>`,
    heading,
  );
}

/** Human copy for each way a token can be unusable. */
export function tokenFailureCopy(
  reason: "not_found" | "expired" | "already_used",
): { heading: string; detail: string } {
  switch (reason) {
    case "expired":
      return {
        heading: "This link has expired",
        detail:
          "Approve links last 72 hours. Open the console and action it there, or wait for tomorrow's briefing.",
      };
    case "already_used":
      return {
        heading: "Already done",
        detail:
          "This link has been used. Nothing further has changed, and nothing was duplicated.",
      };
    default:
      return {
        heading: "This link is not valid",
        detail:
          "It may have been altered in transit. Open the console and action it there.",
      };
  }
}
