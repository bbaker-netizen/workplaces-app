/**
 * Modules guide — a per-module reference card explaining what each
 * piece of the Business Builder Portal does, when you (the Business
 * Builder) use it, and which Monday board it replaces from the old
 * Workplaces setup.
 *
 * Companion to /coach/welcome (which is the workflow guide).
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  Briefcase,
  CalendarClock,
  CheckSquare,
  Compass,
  CreditCard,
  FileText,
  Filter,
  Folder,
  GraduationCap,
  HeartPulse,
  LineChart,
  MessagesSquare,
  PenSquare,
  Puzzle,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";

export default async function ModulesGuidePage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  return (
    <main className="max-w-tbb-narrow mx-auto px-6 py-12 sm:py-16 space-y-12">
      <header className="space-y-3">
        <Link
          href="/coach/welcome"
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy transition-colors duration-tbb-base"
        >
          <ArrowLeft className="w-3 h-3" aria-hidden /> Business Builder guide
        </Link>
        <p className="tbb-eyebrow">Module reference</p>
        <h1 className="text-tbb-h1 font-black text-tbb-navy tracking-tbb-tight">
          What each module does, and when you use it.
        </h1>
        <p className="text-tbb-lead text-tbb-ink-2 max-w-prose">
          The Business Builder Portal absorbs the work you used to spread
          across Monday boards, Drive folders, email threads, and notebooks.
          Each module below explains what the module is, when you reach
          for it, and — where it applies — which Monday board it
          replaces from your current setup.
        </p>
      </header>

      <ModuleCard
        icon={<CalendarClock />}
        name="Sessions"
        what="Every Business Building Session you run — twice a month per client, two hours each, one in person and one virtual. Each session has a date, type, agenda, and notes. Drop in a Fireflies recording ID and Claude extracts proposed action items as drafts you review and publish."
        when="Schedule each BBS as you book it. Open the session record before, during, and after the meeting to take notes and capture commitments."
        replaces={`Your per-client "Business Building Session" boards in Monday (Aiyana, A&M Abatement, Crown and Ember, KSD, MetroCare, Pruvan, QMMS, Summit Cabinets, etc.). The session items + subitem action items + meeting links are all rolled into one record here.`}
        link="/coach/sessions"
        linkLabel="Open sessions (pick an engagement)"
      />

      <ModuleCard
        icon={<CheckSquare />}
        name="Action items"
        what="The commitments coming out of every session — and the ones you create manually between sessions. Each item has a title, description, assignee, due date, status, and revenue/margin impact flags."
        when="During and after every BBS. Whenever the client agrees to do something. Whenever you spot a gap that needs fixing."
        replaces={`The Monday BBS subitems with the Pending / In progress / Waiting on Client/Workplaces / Completed status track. Same flow, but action items roll up to a session and live on each assignee's portal automatically.`}
        link="/coach/action-items"
        linkLabel="All my action items"
      />

      <ModuleCard
        icon={<Briefcase />}
        name="Projects"
        what="Multi-step initiatives inside an engagement — an app build, a hiring drive, a marketing rollout. Each project carries tasks, owners, due dates, milestones, and percent complete."
        when="When the client commits to a sequence of work that spans multiple sessions and needs structured tracking — bigger than an action item, smaller than a full plan."
        replaces={`Your per-client Project Management Plan boards in Monday (e.g., Aiyana Phase 0–4, A&M Abatement, Crown and Ember 6-Month Strategic Plan, MetroCare Execution Plan). Same multi-phase / task layout, surfaced inside the engagement.`}
        link="/coach/projects"
        linkLabel="Open projects (pick an engagement)"
      />

      <ModuleCard
        icon={<Target />}
        name="Goals"
        what="SMART outcomes for the engagement or for a specific leader. Each goal has a target metric, target date, owner, and status. Goals are tagged with the same revenue / margin quality gate as action items."
        when="At engagement kickoff (top-line and margin goals for the year). When a leader is setting their own personal accountability targets — like FDG's partner accountability framework."
        replaces={`The FDG Partner Accountability Framework form pattern in Monday. Each leader's annual outcomes + measurement + risk + mitigation become Goals here. Twice-yearly review built into the cadence.`}
        link="/coach/goals"
        linkLabel="Open goals (pick an engagement)"
      />

      <ModuleCard
        icon={<FileText />}
        name="Deliverables"
        what="The nine standard outputs you ship to clients: SOPs, org charts, job profiles + interview guides, financial dashboards, onboarding guides, client operations setup guides, business plans, marketing plans, stages of growth assessments. Each carries a status (not started / in progress / review / delivered / archived) and the same revenue/margin quality gate."
        when="Whenever you're producing a piece of formal client work. Track from draft through delivery."
        replaces={`The Drive folders + Word docs you currently produce per engagement. Each finished deliverable lives in Documents; the Deliverables module tracks the workflow that gets it there.`}
        link="/coach/deliverables"
        linkLabel="All deliverables in flight"
      />

      <ModuleCard
        icon={<Sparkles />}
        name="Soul File"
        what="The long-form context document for the engagement. Why the business exists, where it is today, where it wants to be in 12 months, founders, hard-won learnings. Vector-embedded for semantic search across every Soul File you own."
        when="Write it once at engagement start. Edit when the strategic story shifts. Refer to it before every BBS to bring the right context."
        replaces={`The kickoff notes you'd previously kept in a personal notebook or scattered across Monday updates. Now it's one canonical document per engagement that you and the client both reference.`}
        link="/coach/soul-search"
        linkLabel="Soul File search (cross-engagement)"
      />

      <ModuleCard
        icon={<MessagesSquare />}
        name="Communication"
        what="Threaded messages between you and the client between sessions. Two thread types per engagement: Leadership (you + senior leaders only — private from operators) and Team (everyone you've invited). Mention with @name to email-notify. Files attach via the paperclip and also land in Documents."
        when="For anything between sessions — questions, decisions, file shares, things you want me to see before we meet."
        replaces={`The email chains and Slack messages you currently use between sessions. Now everything is threaded against the engagement and audit-trailed.`}
        link="/coach/communication"
        linkLabel="Open communication (pick an engagement)"
      />

      <ModuleCard
        icon={<Folder />}
        name="Documents"
        what="Every file related to the engagement, scoped per engagement. SOPs, signed contracts, assessments, financial dashboards, intake forms. Each upload has tags, an uploader, a version history. 25 MB cap per file."
        when="Anytime you produce or receive a file related to the engagement. Replaces the per-client Drive folder entirely."
        replaces={`Per-client Drive folders. Files attached to Communication messages also land here automatically.`}
        link="/coach/documents"
        linkLabel="Open documents (pick an engagement)"
      />

      <ModuleCard
        icon={<PenSquare />}
        name="Forms"
        what="Structured intake from clients — diagnostic intakes, partner accountability frameworks, monthly pulse, NPS. Each form has questions, a public link with a token, and submissions land as engagement records you can react to."
        when="When you need to capture structured client input rather than a free-text message. Bespoke per-client forms (like FDG's 2026 Goals) live here."
        replaces={`Monday forms like the FDG Partner Accountability Framework. The Builder's Forms module is more limited than Monday's form builder today — for very complex flows, you can still drive them externally and link from a document.`}
        link="/coach/welcome"
        linkLabel="(launching as engagements need them)"
      />

      <ModuleCard
        icon={<UserCheck />}
        name="Hiring"
        what="The per-engagement candidate pipeline. When a client is hiring, you (a) configure the TTI TriMetrix HD job profile in TTI Admin, (b) send candidates the assessment externally, (c) upload each gap report PDF here. The candidate record tracks: Assessing → Interview Scheduled → Decision Pending → Offer Sent → Hired. Generate buttons run Claude with the Workplaces hiring methodology prompts."
        when="When a client is hiring — typically once you've helped them build the job profile and they're ready to start interviewing. Hiring is foundational to the People pillar."
        replaces={`Drive folders with TTI reports + interview transcripts + notes scattered across Monday. The Builder rolls candidate + assessment + interview + offer into a single per-candidate record.`}
        link="/coach/hiring"
        linkLabel="All hires in flight"
      />

      <ModuleCard
        icon={<CreditCard />}
        name="Invoices"
        what="Every invoice you've sent the client, mirrored from QuickBooks Online (primary) or Stripe (occasional). The portal creates the invoice in QBO, QBO handles payment processing, the webhook reflects paid status back here."
        when="When billing the client — monthly retainer (Model C) or one-off project fee."
        replaces={`Creating invoices directly in QBO. You still can — but creating them from the portal links them to the engagement and surfaces paid status to the client automatically.`}
        link="/coach/invoices/new"
        linkLabel="Create a new invoice"
      />

      <ModuleCard
        icon={<HeartPulse />}
        name="Subscriptions"
        what="The inventory of external services you maintain on the client's behalf (Netlify apps, Make.com scenarios, Resend, Clerk, custom domains). Each item: name, vendor, monthly cost, who pays, payment model (Model A / B / C), transfer status."
        when="When onboarding a client on Model C. When a graduation conversation surfaces (Model A or B transfer). When renewal is approaching and you need the run-rate of services."
        replaces={`The mental inventory you currently carry. Now itemized, costed, and visible to the client.`}
        link="/coach/subscriptions"
        linkLabel="All subscription assets"
      />

      <ModuleCard
        icon={<Users />}
        name="Team"
        what="The list of people on the engagement: client leadership, operators, you (the Business Builder). Each carries a role, an email, and a join date. Drives audience-checking on Communication threads."
        when="When inviting a new client member (the engagement creation form invites the client lead; additional people are added here)."
        replaces={`Monday's per-board people list. Now scoped to engagement membership and tied to portal access.`}
        link="/portal/team"
        linkLabel="Open team list (pick an engagement)"
      />

      <ModuleCard
        icon={<Filter />}
        name="Person Profiles"
        what="TTI TriMetrix HD assessment record per individual. Stores Behaviours / Driving Forces / Competencies scores, the gap report PDF, and the Workplaces weighted fit score (40/35/25 — internal only). Tied to engagement membership for client leaders, and to the Hiring module for candidates."
        when="When a client team member completes TTI. When a candidate's gap report comes back from TTI Admin."
        replaces={`The TTI PDF files in Drive + scattered notes about scores. Now structured, weighted per methodology, and surfaced in the right place for Hiring + leadership development conversations.`}
        link="/portal/people"
        linkLabel="Open person profiles (pick an engagement)"
      />

      <ModuleCard
        icon={<ShieldCheck />}
        name="Methodology"
        what="The Workplaces methodology reference: the four pillars (Money / Systems / Time / People), the quality gate (revenue or margin or both), the nine deliverable types, Stages of Growth framework. Read-only summary; the proprietary scoring numbers stay internal."
        when="When you (or a client leader) need to remember why we're doing it this way. Reference material, not a working surface."
        replaces={`Your training docs and the framework explanations you currently carry verbally.`}
        link="/portal/methodology"
        linkLabel="Open methodology reference"
      />

      <ModuleCard
        icon={<GraduationCap />}
        name="Courses"
        what="The native LMS for Workplaces programs — Leadership Module Development System (LMDS), Executive Leadership System (ELS), future programs. Cohort + self-paced delivery. Lesson tracking, enrollment, completion."
        when="When you run a structured learning program rather than 1-on-1 coaching. Cohorts of leaders going through a curriculum together."
        replaces={`There is no current Monday equivalent. The previous LMDS / ELS sessions ran in person or via Zoom with no portal. The Courses module gives the curriculum a home.`}
        link="/portal/courses"
        linkLabel="Open courses"
      />

      <ModuleCard
        icon={<Puzzle />}
        name="Embedded Apps"
        what="Custom Netlify projects you built for a specific client (e.g., the Leadership Dev Field Work app for FDG), surfaced as iframed widgets in the client's portal. Each carries a name, URL, and an auth mode (public / token_passthrough / clerk_sso)."
        when="Once a custom app exists and the client should access it through their portal instead of a separate URL."
        replaces={`Sending the client a separate URL and hoping they bookmark it. Embedded apps appear in their portal nav like any other module.`}
        link="/portal/apps"
        linkLabel="Open embedded apps"
      />

      <section className="border-t border-tbb-line-soft pt-8 space-y-4">
        <p className="tbb-eyebrow">What&apos;s NOT in the portal</p>
        <h2 className="text-tbb-h2 font-bold text-tbb-navy tracking-tbb-tight">
          External tools that stay external.
        </h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ExternalToolCard
            name="QuickBooks Online"
            why="Accounting, tax, and payment processing. The portal posts invoices to QBO; QBO does the rest. Connect once at /coach/profile/quickbooks."
            url="https://qbo.intuit.com"
          />
          <ExternalToolCard
            name="TTI Admin (TriMetrix HD)"
            why="Job profile configuration, assessment sending, candidate intake. Gap report PDFs come out of TTI Admin and into the portal's Hiring or Person Profiles modules."
            url="https://www.ttisi.com"
          />
          <ExternalToolCard
            name="Fireflies"
            why="Meeting transcription. Drop a Fireflies recording ID into a session and the transcript flows in. Claude extracts proposed action items as drafts."
            url="https://app.fireflies.ai"
          />
          <ExternalToolCard
            name="Resend"
            why="Transactional email. Notifications, mention emails, signing requests, invoices all flow through Resend. You don't touch it directly."
            url="https://resend.com"
          />
          <ExternalToolCard
            name="Clerk"
            why="Authentication. Sign-ins, organization membership, role assignment. You don't touch it directly."
            url="https://dashboard.clerk.com"
          />
          <ExternalToolCard
            name="Anthropic Claude"
            why="Every Generate button. Hiring artefacts, deliverable drafts, Soul File summarization, action item extraction, renewal proposals."
            url="https://console.anthropic.com"
          />
        </ul>
      </section>

      <section className="border-t border-tbb-line-soft pt-8 space-y-3">
        <h2 className="text-tbb-h3 font-bold text-tbb-navy tracking-tbb-tight">
          Where to go from here.
        </h2>
        <p className="text-tbb-ink-2">
          For the end-to-end workflow (&quot;how do I take a prospect from
          first contact to renewal&quot;), open the{" "}
          <Link
            href="/coach/welcome"
            className="text-tbb-blue underline underline-offset-4"
          >
            Business Builder guide
          </Link>
          . For a quick interactive tour of the navigation, click{" "}
          <strong className="text-tbb-navy">Take the tour</strong> in
          the footer.
        </p>
      </section>
    </main>
  );
}

function ModuleCard({
  icon,
  name,
  what,
  when,
  replaces,
  link,
  linkLabel,
}: {
  icon: React.ReactNode;
  name: string;
  what: string;
  when: string;
  replaces: string;
  link: string;
  linkLabel: string;
}) {
  return (
    <article className="border border-tbb-line rounded-lg bg-white p-6 space-y-4 shadow-tbb-sm">
      <header className="flex items-start gap-3">
        <span className="flex-none w-10 h-10 rounded-md bg-tbb-blue-100 text-tbb-blue grid place-items-center">
          <span className="w-5 h-5 [&>svg]:w-5 [&>svg]:h-5" aria-hidden>
            {icon}
          </span>
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-tbb-h3 font-bold text-tbb-navy tracking-tbb-tight">
            {name}
          </h2>
        </div>
      </header>
      <Section label="What it is">{what}</Section>
      <Section label="When you use it">{when}</Section>
      <Section label="What it replaces from your Monday setup">
        {replaces}
      </Section>
      <div className="pt-2">
        <Link
          href={link}
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-blue hover:underline"
        >
          {linkLabel} →
        </Link>
      </div>
    </article>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
        {label}
      </p>
      <p className="text-tbb-body text-tbb-ink-2 leading-relaxed">
        {children}
      </p>
    </div>
  );
}

function ExternalToolCard({
  name,
  why,
  url,
}: {
  name: string;
  why: string;
  url: string;
}) {
  return (
    <li className="border border-tbb-line rounded-md bg-white p-4 space-y-1.5">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-bold text-tbb-navy hover:text-tbb-blue transition-colors duration-tbb-base"
      >
        {name} ↗
      </a>
      <p className="text-sm text-tbb-ink-2 leading-relaxed">{why}</p>
    </li>
  );
}

// Unused imports kept for future expansion (e.g., Wallet for an
// invoices add-on, Search/Compass/LineChart for additional sections).
void Wallet;
void Search;
void Compass;
void LineChart;
