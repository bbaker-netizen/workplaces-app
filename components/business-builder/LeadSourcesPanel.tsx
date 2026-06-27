"use client";

import { useState, useTransition } from "react";
import { Check, Copy, KeyRound, Loader2, RefreshCw } from "lucide-react";
import {
  ensureLeadWebhookToken,
  regenerateLeadWebhookToken,
} from "@/lib/actions/lead-sources";

type Channel = {
  name: string;
  trigger: string;
  note?: string;
};

const CHANNELS: Channel[] = [
  {
    name: "Website contact form",
    trigger:
      "If your site is on Netlify, use the Netlify Forms trigger in Make (or your form tool's webhook). Otherwise have the form POST straight to the URL below.",
  },
  {
    name: "Facebook & Instagram ads",
    trigger:
      "Make → 'Facebook Lead Ads ▸ Watch Leads' (and the Instagram equivalent). Connect your Meta account, pick the page + lead form.",
  },
  {
    name: "TikTok ads",
    trigger:
      "Make → 'TikTok Lead Generation ▸ Watch for New Leads'. Connect your TikTok for Business account.",
  },
  {
    name: "YouTube / Google ads",
    trigger:
      "Make → 'Google Lead Form Ads ▸ Watch Leads' (covers Google + YouTube lead forms). Connect your Google Ads account.",
  },
  {
    name: "LinkedIn ads",
    trigger:
      "Make → 'LinkedIn Lead Gen Forms ▸ Watch Lead Forms'. Connect your LinkedIn account.",
  },
];

const FIELDS = [
  ["email", "required — the lead's email"],
  ["name", "their full name"],
  ["company", "company / business name"],
  ["phone", "phone number"],
  ["message", "their message / inquiry"],
  ["source", 'where it came from, e.g. "Facebook Ads" (defaults to "Webhook")'],
];

export function LeadSourcesPanel({
  initialToken,
  baseUrl,
}: {
  initialToken: string | null;
  baseUrl: string;
}) {
  const [token, setToken] = useState<string | null>(initialToken);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const url = token ? `${baseUrl}/api/leads/${token}` : null;

  function generate() {
    setError(null);
    startTransition(async () => {
      const r = await ensureLeadWebhookToken();
      if (r.ok) setToken(r.token);
      else setError(r.error);
    });
  }

  function regenerate() {
    if (
      !window.confirm(
        "Generate a new URL? Any channels still pointed at the old URL will stop sending leads until you update them.",
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await regenerateLeadWebhookToken();
      if (r.ok) setToken(r.token);
      else setError(r.error);
    });
  }

  function copy() {
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <div className="space-y-6">
      {/* The URL */}
      <section className="border border-tbb-line rounded-lg bg-white p-6 shadow-tbb-sm space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-tbb-blue" aria-hidden />
          <h2 className="font-bold text-tbb-navy text-lg">Your lead webhook URL</h2>
        </div>
        {!token ? (
          <div className="space-y-3">
            <p className="text-sm text-tbb-ink-3">
              Generate your private URL to start connecting channels. Keep it
              secret — anyone with it can create leads in your Pipeline.
            </p>
            <button
              type="button"
              onClick={generate}
              disabled={pending}
              className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-tbb-caps px-5 py-2.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50 shadow-tbb-cta"
            >
              {pending ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
              ) : (
                <KeyRound className="w-4 h-4" aria-hidden />
              )}
              Generate webhook URL
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-stretch gap-2">
              <code className="flex-1 min-w-0 break-all font-mono text-xs bg-tbb-cream-50 border border-tbb-line rounded-md px-3 py-2.5 text-tbb-ink-2">
                {url}
              </code>
              <button
                type="button"
                onClick={copy}
                className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 rounded-md bg-tbb-navy text-white hover:bg-tbb-navy-700"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5" aria-hidden />
                ) : (
                  <Copy className="w-3.5 h-3.5" aria-hidden />
                )}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <button
              type="button"
              onClick={regenerate}
              disabled={pending}
              className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-danger disabled:opacity-50"
            >
              <RefreshCw className="w-3 h-3" aria-hidden /> Regenerate URL
            </button>
          </div>
        )}
        {error && <p className="text-sm text-tbb-danger">{error}</p>}
      </section>

      {/* What to send */}
      <section className="border border-tbb-line rounded-lg bg-white p-6 shadow-tbb-sm space-y-3">
        <h2 className="font-bold text-tbb-navy text-lg">What to send it</h2>
        <p className="text-sm text-tbb-ink-3">
          POST a JSON body. Only <strong>email</strong> is required; map
          whatever the channel gives you onto these field names:
        </p>
        <ul className="space-y-1.5">
          {FIELDS.map(([field, desc]) => (
            <li key={field} className="text-sm flex gap-2 items-baseline">
              <code className="font-mono text-xs bg-tbb-cream-50 border border-tbb-line rounded px-1.5 py-0.5 text-tbb-blue shrink-0">
                {field}
              </code>
              <span className="text-tbb-ink-3">{desc}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-tbb-ink-3 pt-1">
          Repeat submissions from the same email won&apos;t create duplicate
          cards — they update the existing prospect and log the touch.
        </p>
      </section>

      {/* Per-channel setup */}
      <section className="border border-tbb-line rounded-lg bg-white p-6 shadow-tbb-sm space-y-4">
        <h2 className="font-bold text-tbb-navy text-lg">Connect each channel (Make.com)</h2>
        <p className="text-sm text-tbb-ink-3">
          For each source: create a Make scenario with the channel&apos;s
          trigger, then add an <strong>HTTP ▸ Make a request</strong> module —
          method <code className="font-mono text-xs">POST</code>, the URL
          above, body type <em>Raw / JSON</em> — and map the lead&apos;s fields
          onto the names above. Set <code className="font-mono text-xs">source</code>{" "}
          to the channel name so your Pipeline shows where each lead came from.
        </p>
        <ul className="space-y-3">
          {CHANNELS.map((c) => (
            <li
              key={c.name}
              className="border border-tbb-line rounded-md p-3.5 bg-tbb-cream/30"
            >
              <p className="font-bold text-tbb-navy text-sm">{c.name}</p>
              <p className="text-sm text-tbb-ink-3 mt-0.5">{c.trigger}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
