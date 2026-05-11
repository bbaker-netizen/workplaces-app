/**
 * Welcome / guide page — the standalone reference companion to the
 * first-visit WelcomeModal. Linkable from the footer ("Take the tour"),
 * shareable, no auto-dismiss timer, full content depth.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  CheckSquare,
  Coins,
  FileText,
  Folder,
  HeartPulse,
  HelpCircle,
  Settings,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { TakeTheTourButton } from "@/components/portal/TakeTheTourButton";

export default async function PortalWelcomePage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");

  const firstName = profile.fullName.split(" ")[0] ?? profile.fullName;

  return (
    <main className="max-w-tbb-narrow mx-auto px-6 py-12 sm:py-16 space-y-10">
      <header className="space-y-3">
        <Link
          href="/portal"
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy transition-colors duration-tbb-base"
        >
          <ArrowLeft className="w-3 h-3" aria-hidden /> Portal
        </Link>
        <p className="tbb-eyebrow">Getting started</p>
        <h1 className="text-tbb-h1 font-black text-tbb-navy tracking-tbb-tight">
          Welcome to your Business Builder Portal, {firstName}.
        </h1>
        <p className="text-tbb-lead text-tbb-ink-2 max-w-prose">
          This is your private workspace for our Business Building engagement —
          a single place for the work we do together. Below is the
          short tour of where everything lives and how to use it.
        </p>
        <div className="pt-2">
          <TakeTheTourButton label="Replay the quick tour" />
        </div>
      </header>

      <Section
        eyebrow="Day to day"
        icon={<CheckSquare className="w-7 h-7 text-tbb-blue" strokeWidth={1.75} aria-hidden />}
        title="Action items"
      >
        <p>
          Action items are the commitments coming out of our coaching.
          Each one has an owner, a due date, and a status. You&apos;ll
          see the ones assigned to you on your dashboard.
        </p>
        <ul className="list-disc pl-5 mt-3 space-y-1 text-tbb-ink-2">
          <li>
            <strong className="text-tbb-navy">Overdue items</strong> sit
            at the top of every list, flagged in the accent colour.
          </li>
          <li>
            <strong className="text-tbb-navy">Update the status</strong>{" "}
            inline from the list — no need to open each item.
          </li>
          <li>
            <strong className="text-tbb-navy">Add a comment</strong> on
            any item to ask a question or flag a blocker.
          </li>
        </ul>
      </Section>

      <Section
        eyebrow="The rhythm"
        icon={<Sparkles className="w-7 h-7 text-tbb-blue" strokeWidth={1.75} aria-hidden />}
        title="Sessions (BBS)"
      >
        <p>
          Twice a month we hold a two-hour Business Building Session.
          One in person, one virtual. You&apos;ll see the upcoming
          session on your dashboard with the agenda and a link to the
          notes from the previous one.
        </p>
        <p className="mt-3">
          After each session, the action items we agreed on appear in
          your portal automatically as drafts. I review and publish them
          within 24 hours.
        </p>
      </Section>

      <Section
        eyebrow="Stay in touch"
        icon={<HelpCircle className="w-7 h-7 text-tbb-blue" strokeWidth={1.75} aria-hidden />}
        title="Communication"
      >
        <p>
          Use the Communication module for anything between sessions:
          quick questions, decisions, files to share, or things you want
          me to see before we meet next.
        </p>
        <p className="mt-3">
          There are two thread types you can post to:
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-1 text-tbb-ink-2">
          <li>
            <strong className="text-tbb-navy">Leadership</strong> — for
            you, me, and any senior leaders on your team.
          </li>
          <li>
            <strong className="text-tbb-navy">Team</strong> — visible to
            everyone you&apos;ve invited into the engagement, including
            managers and operators.
          </li>
        </ul>
        <p className="mt-3">
          Mention someone with{" "}
          <code className="font-mono text-sm bg-tbb-bg-soft px-1.5 py-0.5 rounded-sm">
            @name
          </code>{" "}
          to send them an email notification.
        </p>
      </Section>

      <Section
        eyebrow="Files"
        icon={<Folder className="w-7 h-7 text-tbb-blue" strokeWidth={1.75} aria-hidden />}
        title="Documents"
      >
        <p>
          Every file related to our engagement lives in the Documents
          module — SOPs, signed contracts, assessments, financial
          dashboards, anything. Nothing goes to Drive or a third-party
          link.
        </p>
        <p className="mt-3">
          Upload by clicking the upload button on the Documents page.
          Files larger than 25 MB don&apos;t upload here — for those,
          send via email and I&apos;ll attach them on my side.
        </p>
      </Section>

      <Section
        eyebrow="Big work"
        icon={<FileText className="w-7 h-7 text-tbb-blue" strokeWidth={1.75} aria-hidden />}
        title="Deliverables"
      >
        <p>
          Deliverables are the longer-form pieces of work I produce for
          you. There are nine standard types:
        </p>
        <ol className="list-decimal pl-5 mt-3 space-y-1 text-tbb-ink-2">
          <li>SOPs and process flows</li>
          <li>Org charts</li>
          <li>Job profiles and interview guides</li>
          <li>Financial dashboards</li>
          <li>Onboarding guides</li>
          <li>Client operations setup guides (tool-agnostic)</li>
          <li>Business plans</li>
          <li>Marketing plans</li>
          <li>Stages of Growth assessments</li>
        </ol>
        <p className="mt-3">
          Each deliverable moves top-line revenue, protects margin, or
          both. That&apos;s our quality gate.
        </p>
      </Section>

      <Section
        eyebrow="The frame"
        icon={
          <span className="flex items-center gap-2">
            <Coins className="w-6 h-6 text-tbb-blue" strokeWidth={1.75} aria-hidden />
            <Settings className="w-6 h-6 text-tbb-blue" strokeWidth={1.75} aria-hidden />
            <HeartPulse className="w-6 h-6 text-tbb-blue" strokeWidth={1.75} aria-hidden />
            <Users className="w-6 h-6 text-tbb-blue" strokeWidth={1.75} aria-hidden />
          </span>
        }
        title="The four pillars"
      >
        <p>
          Every piece of work in the portal ties to one of four pillars:
        </p>
        <ul className="list-none pl-0 mt-3 space-y-2 text-tbb-ink-2">
          <li className="flex items-baseline gap-2">
            <Coins className="w-4 h-4 text-tbb-blue self-center" strokeWidth={1.75} aria-hidden />
            <span>
              <strong className="text-tbb-navy">Money</strong> — cash
              flow, margin, financial dashboards, pricing.
            </span>
          </li>
          <li className="flex items-baseline gap-2">
            <Settings className="w-4 h-4 text-tbb-blue self-center" strokeWidth={1.75} aria-hidden />
            <span>
              <strong className="text-tbb-navy">Systems</strong> — how
              the business runs: SOPs, processes, tools.
            </span>
          </li>
          <li className="flex items-baseline gap-2">
            <HeartPulse className="w-4 h-4 text-tbb-blue self-center" strokeWidth={1.75} aria-hidden />
            <span>
              <strong className="text-tbb-navy">Time</strong> — where
              your hours actually go and where they should go.
            </span>
          </li>
          <li className="flex items-baseline gap-2">
            <Users className="w-4 h-4 text-tbb-blue self-center" strokeWidth={1.75} aria-hidden />
            <span>
              <strong className="text-tbb-navy">People</strong> — who is
              doing what, who&apos;s missing, who needs to grow.
            </span>
          </li>
        </ul>
        <p className="mt-4">
          We work the pillar that&apos;s leaking the most. Then the
          next. Build what compounds.
        </p>
      </Section>

      <Section
        eyebrow="Money in"
        icon={<Wallet className="w-7 h-7 text-tbb-blue" strokeWidth={1.75} aria-hidden />}
        title="Invoices"
      >
        <p>
          Every invoice I issue you appears here. Status updates
          (paid / outstanding / overdue) flow automatically from
          QuickBooks Online — you don&apos;t need to do anything to
          mark them paid.
        </p>
        <p className="mt-3">
          If you have a billing question, message me directly on the
          Leadership thread.
        </p>
      </Section>

      <section className="border-t border-tbb-line-soft pt-8 space-y-3">
        <h2 className="text-tbb-h3 font-bold text-tbb-navy tracking-tbb-tight">
          Need help?
        </h2>
        <p className="text-tbb-ink-2">
          Click{" "}
          <strong className="text-tbb-navy">Contact support</strong> in
          the footer of any page. Replies inside business hours
          (Mon–Fri, 8:30 AM – 6:00 PM Mountain Time).
        </p>
        <div className="pt-2 flex flex-wrap items-center gap-3">
          <Link
            href="/portal"
            className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-tbb-caps px-5 py-2.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 transition-colors duration-tbb-base shadow-tbb-cta"
          >
            Open the portal
          </Link>
          <a
            href="mailto:bruce@4workplaces.com"
            className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-tbb-caps px-5 py-2.5 rounded-pill border border-tbb-navy text-tbb-navy hover:bg-tbb-bg-soft transition-colors duration-tbb-base"
          >
            Email support
          </a>
        </div>
      </section>
    </main>
  );
}

function Section({
  eyebrow,
  title,
  icon,
  children,
}: {
  eyebrow: string;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <p className="tbb-eyebrow">{eyebrow}</p>
          <h2 className="text-tbb-h3 font-bold text-tbb-navy tracking-tbb-tight">
            {title}
          </h2>
        </div>
      </div>
      <div className="text-tbb-ink-2 leading-relaxed">{children}</div>
    </section>
  );
}
