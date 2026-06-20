/**
 * ModuleReference — per-module reference cards, merged into the Business
 * Builder guide (previously a separate "Module reference" page). What each
 * module is, when you use it, and which Monday board it replaces.
 */

import Link from "next/link";
import {
  Briefcase,
  CalendarClock,
  CheckSquare,
  FileText,
  Folder,
  GraduationCap,
  MessagesSquare,
  PenSquare,
  Puzzle,
  Target,
  UserCheck,
  Users,
  Filter,
} from "lucide-react";

export function ModuleReference() {
  return (
    <section id="module-reference" className="space-y-6 scroll-mt-24">
      <header className="space-y-2 border-t border-tbb-line-soft pt-10">
        <p className="tbb-eyebrow">Module reference</p>
        <h2 className="text-tbb-h2 font-bold text-tbb-navy tracking-tbb-tight">
          What each module does, and when you use it.
        </h2>
        <p className="text-tbb-body text-tbb-ink-2 max-w-prose">
          Each module below explains what it is, when you reach for it, and —
          where it applies — which Monday board it replaces from your current
          setup.
        </p>
      </header>

      <ModuleCard
        icon={<CalendarClock />}
        name="Sessions"
        what="Every Business Building Session you run — twice a month per client, two hours each, one in person and one virtual. Each session has a date, type, agenda, and notes. Drop in a Fireflies recording ID and Claude extracts proposed action items as drafts you review and publish."
        when="Schedule each BBS as you book it. Open the session record before, during, and after the meeting to take notes and capture commitments."
        replaces={`Your per-client "Business Building Session" boards in Monday. The session items + subitem action items + meeting links are all rolled into one record here.`}
        link="/business-builder/engagements"
        linkLabel="Open sessions (pick an engagement)"
      />
      <ModuleCard
        icon={<CheckSquare />}
        name="Action items"
        what="The commitments coming out of every session — and the ones you create manually between sessions. Each item has a title, description, assignee, due date, status, and revenue/margin impact flags."
        when="During and after every BBS. Whenever the client agrees to do something. Whenever you spot a gap that needs fixing."
        replaces={`The Monday BBS subitems with the Pending / In progress / Waiting / Completed status track. Action items roll up to a session and live on each assignee's portal automatically.`}
        link="/business-builder/action-items"
        linkLabel="All my action items"
      />
      <ModuleCard
        icon={<Briefcase />}
        name="Projects"
        what="Multi-step initiatives inside an engagement — an app build, a hiring drive, a marketing rollout. Each project carries tasks, sub-tasks, owners, due dates, and percent complete, with an interactive Gantt."
        when="When the client commits to a sequence of work that spans multiple sessions and needs structured tracking — bigger than an action item."
        replaces={`Your per-client Project Management Plan boards in Monday. Same multi-phase / task layout, surfaced inside the engagement.`}
        link="/business-builder/projects"
        linkLabel="Open projects"
      />
      <ModuleCard
        icon={<Target />}
        name="Goals"
        what="SMART outcomes for the engagement or a specific leader. Each goal has a target metric, target date, owner, and status, tagged with the same revenue / margin quality gate as action items."
        when="At engagement kickoff (top-line and margin goals for the year). When a leader sets personal accountability targets."
        replaces={`The Partner Accountability Framework form pattern in Monday — each leader's annual outcomes + measurement become Goals here.`}
        link="/business-builder/goals"
        linkLabel="Open goals (pick an engagement)"
      />
      <ModuleCard
        icon={<FileText />}
        name="Deliverables"
        what="The nine standard outputs you ship to clients: SOPs, org charts, job profiles + interview guides, financial dashboards, onboarding guides, operations setup guides, business plans, marketing plans, stages of growth assessments. Each carries a status and completion date."
        when="Whenever you're producing a piece of formal client work. Track from draft through delivery."
        replaces={`The Drive folders + Word docs you currently produce per engagement.`}
        link="/business-builder/deliverables"
        linkLabel="All deliverables in flight"
      />
      <ModuleCard
        icon={<MessagesSquare />}
        name="Communication"
        what="Threaded messages between you and the client between sessions. Two thread types per engagement: Leadership (you + senior leaders only) and Team (everyone you've invited). @mention to email-notify; files attach and also land in Documents."
        when="For anything between sessions — questions, decisions, file shares, things to review before you meet."
        replaces={`The email chains and Slack messages you currently use between sessions.`}
        link="/business-builder/communication"
        linkLabel="Open communication (pick an engagement)"
      />
      <ModuleCard
        icon={<Folder />}
        name="Documents"
        what="Every file related to the engagement, scoped per engagement, with tags, an uploader, and version history. A linked Google Drive folder also mirrors in read-only."
        when="Anytime you produce or receive a file related to the engagement. Replaces the per-client Drive folder."
        replaces={`Per-client Drive folders. Files attached to Communication messages also land here automatically.`}
        link="/business-builder/documents"
        linkLabel="Open documents (pick an engagement)"
      />
      <ModuleCard
        icon={<PenSquare />}
        name="Forms"
        what="Structured intake from clients — diagnostic intakes, accountability frameworks, monthly pulse, NPS. Each form has a public link with a token; submissions land as engagement records."
        when="When you need to capture structured client input rather than a free-text message."
        replaces={`Monday forms like the Partner Accountability Framework.`}
        link="/business-builder/welcome"
        linkLabel="(launching as engagements need them)"
      />
      <ModuleCard
        icon={<UserCheck />}
        name="Hiring"
        what="The per-engagement candidate pipeline. Configure the TTI job profile externally, send candidates the assessment, upload each gap report PDF here. Status tracks Assessing → Interview → Decision → Offer → Hired. Generate buttons run Claude with the hiring methodology."
        when="When a client is hiring and ready to start interviewing."
        replaces={`Drive folders with TTI reports + interview transcripts scattered across Monday.`}
        link="/business-builder/hiring"
        linkLabel="All hires in flight"
      />
      <ModuleCard
        icon={<Users />}
        name="Team"
        what="The people on the engagement: client leadership, operators, and you. Each carries a role, email, and join date; drives audience-checking on Communication threads."
        when="When inviting a new client member."
        replaces={`Monday's per-board people list — now scoped to engagement membership and portal access.`}
        link="/portal/team"
        linkLabel="Open team list (pick an engagement)"
      />
      <ModuleCard
        icon={<Filter />}
        name="Person Profiles"
        what="TTI TriMetrix HD assessment record per individual — Behaviours / Driving Forces / Competencies, the gap report PDF, and the internal weighted fit score. Tied to engagement members and the Hiring module."
        when="When a client team member completes TTI, or a candidate's gap report comes back."
        replaces={`The TTI PDF files in Drive + scattered notes about scores.`}
        link="/portal/people"
        linkLabel="Open person profiles (pick an engagement)"
      />
      <ModuleCard
        icon={<GraduationCap />}
        name="Courses"
        what="The native LMS for Workplaces programs (LMDS, ELS, future programs). Cohort + self-paced delivery, lesson tracking, enrollment, completion."
        when="When you run a structured learning program rather than 1-on-1 coaching."
        replaces={`No current Monday equivalent — the curriculum gets a home.`}
        link="/portal/courses"
        linkLabel="Open courses"
      />
      <ModuleCard
        icon={<Puzzle />}
        name="Apps"
        what="Custom Netlify projects you built for a specific client, surfaced as iframed widgets in their portal — with install instructions and per-user favourites. Each carries a name, URL, and auth mode."
        when="Once a custom app exists and the client should access it through their portal."
        replaces={`Sending the client a separate URL and hoping they bookmark it.`}
        link="/portal/apps"
        linkLabel="Open apps"
      />

      <section className="border-t border-tbb-line-soft pt-8 space-y-4">
        <p className="tbb-eyebrow">What&apos;s NOT in the portal</p>
        <h3 className="text-tbb-h3 font-bold text-tbb-navy tracking-tbb-tight">
          External tools that stay external.
        </h3>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ExternalToolCard
            name="QuickBooks Online"
            why="Accounting, tax, and payments. The portal posts invoices to QBO and reads payments back. Connect at Settings → Integrations."
            url="https://qbo.intuit.com"
          />
          <ExternalToolCard
            name="TTI Admin (TriMetrix HD)"
            why="Job profile configuration, assessment sending, candidate intake. Gap report PDFs come out of TTI and into Hiring / Person Profiles."
            url="https://www.ttisi.com"
          />
          <ExternalToolCard
            name="Fireflies"
            why="Meeting transcription. Drop a recording into a session and the transcript flows in; Claude extracts proposed action items."
            url="https://app.fireflies.ai"
          />
          <ExternalToolCard
            name="Resend"
            why="Transactional email — notifications, mentions, signing requests, invoices. You don't touch it directly."
            url="https://resend.com"
          />
          <ExternalToolCard
            name="Clerk"
            why="Authentication — sign-ins, organization membership, roles. You don't touch it directly."
            url="https://dashboard.clerk.com"
          />
          <ExternalToolCard
            name="Anthropic Claude"
            why="Every Generate button — hiring artefacts, deliverable drafts, insights summaries, action-item extraction, renewal proposals."
            url="https://console.anthropic.com"
          />
        </ul>
      </section>
    </section>
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
          <h3 className="text-tbb-h3 font-bold text-tbb-navy tracking-tbb-tight">
            {name}
          </h3>
        </div>
      </header>
      <Field label="What it is">{what}</Field>
      <Field label="When you use it">{when}</Field>
      <Field label="What it replaces from your Monday setup">{replaces}</Field>
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

function Field({
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
      <p className="text-tbb-body text-tbb-ink-2 leading-relaxed">{children}</p>
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
