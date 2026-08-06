"use client";

/**
 * Step one of the Climb prep: send them the before-we-meet assessment.
 *
 * The link is personalised per prospect AND per sender. `fname`, `company`
 * and `email` prefill the form so most people type nothing; `bb` tells the
 * page whose name to speak in, so it reads "Send it to Jen" when Jen sent
 * it. Building that by hand means editing four values and remembering to
 * escape the spaces, which is exactly the job that gets done wrong once
 * and then quietly abandoned.
 *
 * `fname` NOT `name`: WordPress reserves `name` as a query var and strips
 * it before the page ever sees it.
 *
 * There is no "sent" flag here on purpose. Nothing can observe whether the
 * email left, so a tick would be a claim the system cannot back. What it
 * shows instead is the fact it does know: whether the answers came back.
 */

import { useState } from "react";
import { Check, Copy } from "lucide-react";

const BASE = "https://4workplaces.com/before-we-meet/";

export function BeforeWeMeetStep({
  firstName,
  companyName,
  contactEmail,
  builderName,
}: {
  firstName: string | null;
  companyName: string | null;
  contactEmail: string | null;
  /** The owning Business Builder. Omitted from the link when unowned,
   *  which leaves the page on its neutral wording rather than naming
   *  the wrong person. */
  builderName: string | null;
}) {
  const [copied, setCopied] = useState(false);

  const qs = new URLSearchParams();
  if (firstName) qs.set("fname", firstName);
  if (companyName) qs.set("company", companyName);
  if (contactEmail) qs.set("email", contactEmail);
  if (builderName) qs.set("bb", builderName);
  const url = qs.toString() ? `${BASE}?${qs.toString()}` : BASE;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked in some browsers on non-secure origins. The
      // input below is selectable, so there is always a way through.
      setCopied(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-tbb-ink-2">
        Two minutes for them, and it means the first half of your meeting is
        not spent on questions you could have asked in advance.
      </p>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 min-w-0 text-xs font-mono border border-tbb-line rounded px-2 py-1.5 text-tbb-ink-2 bg-tbb-surface"
        />
        <button
          type="button"
          onClick={copy}
          className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5" aria-hidden />
          ) : (
            <Copy className="w-3.5 h-3.5" aria-hidden />
          )}
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      <p className="text-xs text-tbb-ink-3">
        Or send it from Communications, Email, using the &ldquo;Send the
        pre-meeting assessment&rdquo; template, which builds the same link.
      </p>
    </div>
  );
}
