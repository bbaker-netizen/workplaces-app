import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowUpRight, FileText, Mountain } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { THE_CLIMB_URL, CLIMB_COMPANION_TOOLS } from "@/lib/prep-kit";

/**
 * The Climb — meeting prep kit. One screen a Business Builder opens before
 * a prospect meeting: launch the interactive Climb app + grab the companion
 * documents, no hunting through template folders.
 */
export default async function TheClimbPage({
  searchParams,
}: {
  searchParams: Promise<{ prospectId?: string; company?: string }>;
}) {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  const { prospectId, company } = await searchParams;
  // Carry the lead's context into The Climb so anything generated there can
  // be tied back to this prospect's record.
  const climbHref =
    THE_CLIMB_URL && prospectId
      ? `${THE_CLIMB_URL}${THE_CLIMB_URL.includes("?") ? "&" : "?"}prospect_id=${encodeURIComponent(prospectId)}${company ? `&company=${encodeURIComponent(company)}` : ""}`
      : THE_CLIMB_URL;

  return (
    <main className="max-w-4xl mx-auto px-6 py-12 space-y-8">
      {/* Back to the lead this prep is for — so the Business Builder is never
          stranded on the kit page with no way home to the prospect record. */}
      {prospectId ? (
        <Link
          href={`/business-builder/pipeline/${prospectId}`}
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-blue"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
          Back to {company ? `${company}'s` : "the"} profile
        </Link>
      ) : (
        <Link
          href="/business-builder/pipeline"
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-blue"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
          Back to the pipeline
        </Link>
      )}

      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          Business Builder · Meeting prep
        </p>
        <h1 className="font-display font-bold text-foreground text-4xl tracking-tight leading-none">
          The Climb
        </h1>
        <p className="font-sans text-sm text-muted-foreground max-w-prose">
          Your prep kit for a prospect meeting — the Map of the Mountain and
          the four Building Blocks, plus the companion tools. Everything for
          the conversation in one place.
        </p>
        {company && (
          <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-blue">
            Prepping for {company}
          </p>
        )}
      </header>

      {/* Launch the interactive app */}
      <section className="rounded-lg border border-tbb-blue/40 bg-gradient-to-br from-tbb-blue-100 via-tbb-cream-50 to-white p-6 shadow-tbb-sm">
        <div className="flex items-start gap-4">
          <span className="flex-none w-12 h-12 rounded-lg bg-tbb-blue text-white grid place-items-center">
            <Mountain className="w-6 h-6" aria-hidden />
          </span>
          <div className="flex-1 min-w-0 space-y-2">
            <h2 className="text-lg font-bold text-tbb-navy">
              Open The Climb
            </h2>
            <p className="text-sm text-tbb-ink-2">
              The interactive Map of the Mountain and the four Building Blocks —
              walk the prospect up the mountain.
            </p>
            {THE_CLIMB_URL ? (
              <a
                href={climbHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700"
              >
                Open The Climb <ArrowUpRight className="w-3.5 h-3.5" aria-hidden />
              </a>
            ) : (
              <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-cream-100 text-tbb-ink-3">
                App link coming soon
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Companion documents */}
      <section className="space-y-3">
        <h2 className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
          Companion tools
        </h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CLIMB_COMPANION_TOOLS.map((tool) => (
            <li key={tool.file}>
              <a
                href={tool.file}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start gap-3 h-full rounded-lg border border-tbb-line bg-white p-4 hover:border-tbb-blue hover:shadow-tbb-sm transition-all"
              >
                <span className="flex-none w-10 h-10 rounded-md bg-tbb-blue-100 text-tbb-blue grid place-items-center">
                  <FileText className="w-5 h-5" aria-hidden />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1 font-bold text-tbb-navy">
                    {tool.title}
                    <ArrowUpRight
                      className="w-3.5 h-3.5 text-tbb-ink-3 group-hover:text-tbb-blue"
                      aria-hidden
                    />
                  </span>
                  <span className="block text-sm text-tbb-ink-2 mt-0.5">
                    {tool.description}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-tbb-ink-3">
          Open in a new tab to view, print, or save. These are bundled with the
          app, so they&apos;re always here — no hunting.
        </p>
      </section>
    </main>
  );
}
