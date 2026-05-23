/**
 * Coach Pipeline view — Phase 5 CRM.
 *
 * Tabular list of every prospect in the master org with all the
 * columns a real CRM needs: company, contact, email, phone, stage,
 * expected value, next action, owner, last contact, created. Each
 * row links to the prospect detail page.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { listProspects } from "@/lib/db/queries/prospects";
import { getCurrentUserPrefs } from "@/lib/db/queries/user-prefs";
import { ProspectTable } from "@/components/pipeline/ProspectTable";
import { STAGE_ORDER, STAGE_STYLES } from "@/lib/pipeline/stages";

export default async function PipelinePage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  const [prospects, prefs] = await Promise.all([
    listProspects(),
    getCurrentUserPrefs(),
  ]);

  // Stage counts for the summary chips above the table.
  const counts = new Map<string, number>();
  for (const p of prospects) {
    counts.set(p.status, (counts.get(p.status) ?? 0) + 1);
  }

  return (
    <main className="max-w-screen-2xl mx-auto px-6 py-12 space-y-8">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <p className="tbb-eyebrow">Pipeline</p>
          <h1 className="text-tbb-h2 font-black text-tbb-navy tracking-tbb-tight">
            Your prospects
          </h1>
          <p className="text-sm text-tbb-ink-3">
            {prospects.length} prospect{prospects.length === 1 ? "" : "s"} across
            all stages.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/coach/pipeline/new"
            className="inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 transition-colors duration-tbb-base shadow-tbb-cta"
          >
            <Plus className="w-4 h-4" aria-hidden />
            New prospect
          </Link>
        </div>
      </header>

      {/* Stage summary chips */}
      <div className="flex flex-wrap gap-2">
        {STAGE_ORDER.map((s) => {
          const count = counts.get(s) ?? 0;
          if (count === 0) return null;
          const style = STAGE_STYLES[s];
          return (
            <span
              key={s}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-pill text-[11px] font-bold uppercase tracking-tbb-caps ${style.chipClass}`}
            >
              {style.label}
              <span className="bg-white/30 px-1.5 py-0 rounded-pill tabular-nums">
                {count}
              </span>
            </span>
          );
        })}
      </div>

      {prospects.length === 0 ? (
        <div className="border border-tbb-line rounded-lg bg-gradient-to-br from-tbb-cream-50 to-white p-10 text-center space-y-3">
          <div className="text-5xl" aria-hidden>
            🎣
          </div>
          <p className="font-bold text-tbb-navy text-lg">
            Empty pipeline. Quietest it&apos;ll be all year.
          </p>
          <p className="text-sm text-tbb-ink-3 max-w-md mx-auto">
            New leads land here automatically when someone fills out your
            diagnostic, or when your website form pings the app. Until then,
            it&apos;s on you to go find them. Add one to get rolling.
          </p>
          <div className="pt-3">
            <Link
              href="/coach/pipeline/new"
              className="inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-tbb-caps px-5 py-2.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 shadow-tbb-cta transition-transform duration-tbb-fast hover:scale-[1.02]"
            >
              <Plus className="w-4 h-4" aria-hidden /> Add the first one
            </Link>
          </div>
        </div>
      ) : (
        <ProspectTable
          prospects={prospects}
          initialPrefs={prefs.pipelineColumnPrefs}
        />
      )}
    </main>
  );
}
