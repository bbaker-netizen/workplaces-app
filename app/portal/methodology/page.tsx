/**
 * /portal/methodology — read-only educational content for clients.
 *
 * Per CLAUDE.md "Methodology IP Exposure Rules":
 *   Visible: framework names, educational explanations, the 9
 *   deliverable categories, the top-line / margin Quality Gate,
 *   the Stages of Growth framework concepts.
 *   Internal only: the 40/35/25 weighting numbers, scoring rubrics,
 *   proprietary algorithms, raw assessment scores.
 *
 * This page is the public-facing layer. No DB read; the content is
 * methodology IP encoded in the source so client_employee can browse
 * it without hitting any tenant data.
 */

import { redirect } from "next/navigation";
import { CheckCircle2, BookOpen, Target, Compass } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";

export default async function MethodologyPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-12">
      <header className="space-y-3">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          Workplaces methodology
        </p>
        <h1 className="font-bold text-foreground text-4xl sm:text-5xl tracking-tight leading-none">
          The frameworks behind your engagement
        </h1>
        <p className="font-sans text-base text-muted-foreground max-w-prose">
          Business Builder Portal is the surface. The methodology is what makes it work. Here&apos;s the language and the frameworks Bruce uses with every client.
        </p>
      </header>

      <Section
        icon={<Target className="w-5 h-5" aria-hidden />}
        title="The Quality Gate"
      >
        <p>
          Every commitment, every deliverable, every project —
          if it doesn&apos;t move <strong>top-line revenue</strong> or
          protect <strong>margin</strong>, it doesn&apos;t belong here. That&apos;s
          why action items carry an explicit revenue / margin
          flag. Tagging neither is a signal to question whether the work
          should happen at all.
        </p>
      </Section>

      <Section
        icon={<Compass className="w-5 h-5" aria-hidden />}
        title="Business Building Sessions (BBS)"
      >
        <p>
          Twice a month, two hours, with each client — one in-person,
          one virtual. The session is where the work gets shaped:
          projects scoped, action items captured, blockers cleared.
          Sessions are scheduled in the <em>Sessions</em> module; notes
          stay attached to the session so the rhythm of the engagement
          is always visible.
        </p>
      </Section>

      <Section
        icon={<BookOpen className="w-5 h-5" aria-hidden />}
        title="The Soul File"
      >
        <p>
          Each engagement has one Soul File — the deep context document.
          Why the business exists. Where it&apos;s trying to go. The
          founders, the strategy, the hard-won learnings. It&apos;s the
          background music for every BBS, every deliverable, every
          decision. Open the <em>Soul File</em> module any time to read
          or update it.
        </p>
      </Section>

      <Section
        icon={<CheckCircle2 className="w-5 h-5" aria-hidden />}
        title="The 9 deliverable types"
      >
        <p>
          Workplaces builds these for you over the course of an
          engagement:
        </p>
        <ol className="list-decimal pl-5 space-y-2 marker:text-muted-foreground">
          <li><strong>SOPs &amp; Process Flows</strong> — how the work actually gets done, written down.</li>
          <li><strong>Org Charts</strong> — who owns what, with reporting lines and accountability statements.</li>
          <li><strong>Job Profiles &amp; Interview Guides</strong> — built off TTI TriMetrix HD assessments and topgrading-style interview design.</li>
          <li><strong>Financial Dashboards</strong> — the numbers you actually need to run the business, monthly P&amp;L plus tracking.</li>
          <li><strong>Workplaces Application Onboarding Guides</strong> — how your team uses The Builder.</li>
          <li><strong>Client Operations Setup Guides</strong> — tool-agnostic playbooks (e.g. JobTread for trades, QuickBooks setup).</li>
          <li><strong>Business Plans</strong> — the master document, refreshed annually.</li>
          <li><strong>Marketing Plans</strong> — channel mix, calendar, measurement.</li>
          <li><strong>Stages of Growth Assessments</strong> — where you are on the framework, what changes when you move.</li>
        </ol>
      </Section>

      <Section
        icon={<Compass className="w-5 h-5" aria-hidden />}
        title="Stages of Growth"
      >
        <p>
          Most businesses don&apos;t fail because the strategy is wrong.
          They fail because the operating system stops fitting the size of
          the company. The Stages of Growth framework names the
          transitions — from solo operator, to small team, to
          professionally-managed firm — and what has to change in each
          stage. Your engagement tracks where you are, where you&apos;re
          heading, and what work each transition demands.
        </p>
      </Section>

      <Section
        icon={<CheckCircle2 className="w-5 h-5" aria-hidden />}
        title="How action items work"
      >
        <p>
          Every commitment lives as an action item — owned, dated,
          flagged for revenue or margin impact. Drafts come from BBS
          recordings (auto-extracted; Business Builder reviews and publishes).
          Manual ones come straight from the Business Builder or you. The status
          pill on the card is the fast path: tap and update.
        </p>
      </Section>
    </main>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-bold text-foreground text-xl sm:text-2xl tracking-tight flex items-center gap-3">
        <span className="text-tbb-navy">{icon}</span>
        {title}
      </h2>
      <div className="font-sans text-base text-foreground leading-relaxed [&_p]:my-0 [&>*+*]:mt-3 [&_a]:text-tbb-navy [&_a]:underline [&_a]:underline-offset-2 [&_strong]:font-bold [&_em]:italic">
        {children}
      </div>
    </section>
  );
}
