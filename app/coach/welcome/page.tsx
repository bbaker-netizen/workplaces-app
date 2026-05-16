/**
 * Coach welcome / operating guide.
 *
 * The end-to-end manual for a new Business Builder (Bruce, Jen, future hires)
 * running a client engagement through the Business Builder Portal.
 * Top-to-bottom flow: prospect lands → contract → engagement opens →
 * first session → ongoing rhythm → deliverables → billing → renewal.
 *
 * Each section has: what this phase is, what to do, the exact URL
 * to act on, and what to expect next.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Briefcase,
  CalendarClock,
  CheckSquare,
  Compass,
  CreditCard,
  FileSignature,
  FileText,
  Filter,
  Folder,
  HeartPulse,
  MessagesSquare,
  PenSquare,
  Sparkles,
  Target,
  UserCheck,
} from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { TakeTheTourButton } from "@/components/coach/TakeTheCoachTourButton";

export default async function CoachWelcomePage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  const firstName = profile.fullName.split(" ")[0] ?? profile.fullName;

  return (
    <main className="max-w-tbb-narrow mx-auto px-6 py-12 sm:py-16 space-y-12">
      <header className="space-y-3">
        <p className="tbb-eyebrow">Business Builder operating guide</p>
        <h1 className="text-tbb-h1 font-black text-tbb-navy tracking-tbb-tight">
          The end-to-end Business Builder guide, {firstName}.
        </h1>
        <p className="text-tbb-lead text-tbb-ink-2 max-w-prose">
          This is the full playbook for running a client engagement
          through the Business Builder Portal — from the first time a
          prospect hits your diagnostic, to the day you renew them for
          another year. Read top to bottom once; come back to specific
          sections when you need a refresher.
        </p>
        <div className="pt-2 flex flex-wrap gap-3">
          <TakeTheTourButton label="Run the interactive walkthrough" />
          <Link
            href="/coach/welcome/modules"
            className="inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-tbb-caps px-5 py-2.5 rounded-pill bg-tbb-navy text-white hover:bg-tbb-navy-700 transition-colors duration-tbb-base"
          >
            Module reference
          </Link>
          <Link
            href="/coach"
            className="inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-tbb-caps px-5 py-2.5 rounded-pill border border-tbb-navy text-tbb-navy hover:bg-tbb-bg-soft transition-colors duration-tbb-base"
          >
            Open Business Builder Console
          </Link>
        </div>
      </header>

      <Phase number="01" label="Pipeline" caption="Bring new prospects in">
        <Step
          icon={<Filter className="w-6 h-6 text-tbb-blue" strokeWidth={1.75} aria-hidden />}
          title="See every prospect in flight"
          href="/coach/pipeline"
          hrefLabel="Open the Pipeline"
        >
          <p>
            Your Pipeline view groups every prospect by lifecycle stage:
            Diagnostic pending → Diagnostic complete → Proposal sent →
            Contract sent → Contract signed → Onboarded → Lost. The
            stage filter chip is also the primary action — change a
            prospect&apos;s status inline.
          </p>
        </Step>

        <Step
          icon={<Compass className="w-6 h-6 text-tbb-blue" strokeWidth={1.75} aria-hidden />}
          title="Share the public diagnostic"
          href="/diagnostic"
          hrefLabel="See the diagnostic"
        >
          <p>
            <code className="font-mono text-sm bg-tbb-bg-soft px-1.5 py-0.5 rounded-sm">
              workplaces-the-builder.netlify.app/diagnostic
            </code>{" "}
            is your public intake form. Share it on social, in cold
            email signatures, or after a sales call. Submissions
            auto-create a prospect record in your Pipeline with status{" "}
            <strong>Diagnostic complete</strong>.
          </p>
          <p className="mt-2 text-sm text-tbb-ink-3">
            You&apos;ll see the company, contact, and the prospect&apos;s
            answers to the diagnostic questions on their detail page.
          </p>
        </Step>
      </Phase>

      <Phase number="02" label="Sign" caption="Lock the engagement in writing">
        <Step
          icon={<FileSignature className="w-6 h-6 text-tbb-blue" strokeWidth={1.75} aria-hidden />}
          title="Send for signature"
          href="/coach/profile/signature"
          hrefLabel="Set up your signature"
        >
          <p>
            Open any prospect, scroll to the Signing section, click{" "}
            <strong>Send for signature</strong>. Upload your contract
            PDF, add up to four signers (their contact email + name +
            role), optional message, optional &quot;auto-sign as me&quot;
            (only enabled if you&apos;ve uploaded your signature image at{" "}
            <Link href="/coach/profile/signature" className="text-tbb-blue underline">
              /coach/profile/signature
            </Link>
            ).
          </p>
          <p className="mt-2">
            Each signer gets an email with their personal signing link.
            Sequential routing — signer 1 finishes, signer 2 gets the
            email, and so on. When everyone has signed, the fully-signed
            PDF (with a certificate of completion page) lands in your
            inbox and the prospect&apos;s status flips to{" "}
            <strong>Contract signed</strong>.
          </p>
        </Step>
      </Phase>

      <Phase number="03" label="Open the engagement" caption="Provision the portal">
        <Step
          icon={<Sparkles className="w-6 h-6 text-tbb-blue" strokeWidth={1.75} aria-hidden />}
          title="Create the engagement"
          href="/coach/engagements/new"
          hrefLabel="Open new engagement form"
        >
          <p>
            Once the contract is signed, open{" "}
            <Link href="/coach/engagements/new" className="text-tbb-blue underline">
              /coach/engagements/new
            </Link>
            . Fill in:
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Engagement name (the client&apos;s business name)</li>
            <li>Engagement type — Accelerator or Implementer</li>
            <li>Client lead full name + email (their portal invitation)</li>
            <li>Planned start date</li>
          </ul>
          <p className="mt-2">
            Submitting sets up the client&apos;s private workspace and emails
            the client lead a sign-up invitation. Their first sign-in
            lands them on the client portal with the Welcome tour.
          </p>
        </Step>

        <Step
          icon={<Sparkles className="w-6 h-6 text-tbb-blue" strokeWidth={1.75} aria-hidden />}
          title="Write the Soul File"
          href="/coach/soul-file/[engagementId]"
          hrefLabel="(from each engagement)"
        >
          <p>
            The Soul File is the long-form context document for the
            engagement. Why the business exists, where it is today,
            where it wants to be in 12 months, founders, learnings.
            Write it once after your kickoff, edit as you go. The
            client sees it read-only on their portal.
          </p>
        </Step>
      </Phase>

      <Phase number="04" label="Engage" caption="Run the twice-monthly rhythm">
        <Step
          icon={<CalendarClock className="w-6 h-6 text-tbb-blue" strokeWidth={1.75} aria-hidden />}
          title="Schedule Business Building Sessions"
          href="/coach/sessions/[engagementId]"
          hrefLabel="(from each engagement)"
        >
          <p>
            Two BBS per month per client: one in person, one virtual.
            Two hours each. Add the date and time in Mountain Time
            (Luxon converts to UTC for storage); the client sees their
            local format.
          </p>
          <p className="mt-2">
            On the session detail page you can paste in a Fireflies
            recording ID. The system pulls the transcript and Claude
            extracts proposed action items as drafts — you review,
            assign, and publish them within 24 hours.
          </p>
        </Step>

        <Step
          icon={<CheckSquare className="w-6 h-6 text-tbb-blue" strokeWidth={1.75} aria-hidden />}
          title="Manage action items"
          href="/coach/action-items"
          hrefLabel="Open all action items"
        >
          <p>
            Every committed task lives here. Drafts (created by Claude
            from a transcript or by you) are Business-Builder-side only. Published
            items appear on the assignee&apos;s portal with an email
            notification. The dashboard sorts overdue-first.
          </p>
          <p className="mt-2 text-sm text-tbb-ink-3">
            Tag any item with <strong>revenue impact</strong> or{" "}
            <strong>margin impact</strong> — that&apos;s the quality
            gate. Items without either flag get demoted in coaching
            priority.
          </p>
        </Step>

        <Step
          icon={<MessagesSquare className="w-6 h-6 text-tbb-blue" strokeWidth={1.75} aria-hidden />}
          title="Use Communication between sessions"
          href="/coach/communication/[engagementId]"
          hrefLabel="(from each engagement)"
        >
          <p>
            Two thread types per engagement:
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>
              <strong>Leadership</strong> — you + senior leaders only.
              Private from operators.
            </li>
            <li>
              <strong>Team</strong> — visible to everyone in the
              engagement.
            </li>
          </ul>
          <p className="mt-2">
            @mention anyone to email-notify them (gated by the
            working-hours guard). Attach files via the paperclip; they
            also land in Documents.
          </p>
        </Step>
      </Phase>

      <Phase number="05" label="Deliver" caption="Ship the deep work">
        <Step
          icon={<FileText className="w-6 h-6 text-tbb-blue" strokeWidth={1.75} aria-hidden />}
          title="The nine deliverable types"
          href="/coach/deliverables"
          hrefLabel="Open Deliverables"
        >
          <p>
            Every long-form coaching artefact is one of nine types:
          </p>
          <ol className="list-decimal pl-5 mt-2 space-y-1">
            <li>SOPs and process flows</li>
            <li>Org charts</li>
            <li>Job profiles and interview guides</li>
            <li>Financial dashboards</li>
            <li>Onboarding guides</li>
            <li>Client operations setup guides</li>
            <li>Business plans</li>
            <li>Marketing plans</li>
            <li>Stages of Growth assessments</li>
          </ol>
          <p className="mt-2">
            Each deliverable carries a status (not started, in progress,
            review, delivered, archived), a type, and the same revenue
            / margin impact flags as action items.
          </p>
        </Step>

        <Step
          icon={<UserCheck className="w-6 h-6 text-tbb-blue" strokeWidth={1.75} aria-hidden />}
          title="Hiring pipeline"
          href="/coach/hiring"
          hrefLabel="Open Hiring"
        >
          <p>
            When a client is hiring, configure the TTI TriMetrix HD job
            profile in their external TTI Admin account, send candidates
            the assessment, and upload each gap report PDF to the
            candidate record in the portal. Status pipeline: Assessing →
            Interview Scheduled → Decision Pending → Offer Sent → Hired.
          </p>
          <p className="mt-2 text-sm text-tbb-ink-3">
            Generate buttons for gap analysis, interview guide, offer
            letter, and 90-day onboarding plan call Claude with the
            right Workplaces methodology prompt.
          </p>
        </Step>

        <Step
          icon={<Target className="w-6 h-6 text-tbb-blue" strokeWidth={1.75} aria-hidden />}
          title="Goals and projects"
          href="/coach/goals"
          hrefLabel="Goals · Projects"
        >
          <p>
            Goals are SMART; projects are larger initiatives with tasks
            and milestones. Both inherit the revenue/margin quality gate.
            Use Goals for outcomes; use Projects for app builds, hires,
            marketing campaigns.
          </p>
        </Step>
      </Phase>

      <Phase number="06" label="Bill" caption="Invoice through QuickBooks Online">
        <Step
          icon={<CreditCard className="w-6 h-6 text-tbb-blue" strokeWidth={1.75} aria-hidden />}
          title="Create QBO invoices from the portal"
          href="/coach/invoices/new"
          hrefLabel="Create an invoice"
        >
          <p>
            Connect QuickBooks once at{" "}
            <Link href="/coach/profile/quickbooks" className="text-tbb-blue underline">
              /coach/profile/quickbooks
            </Link>
            . After that, every invoice you create in the portal posts
            to your QBO company file — QBO does the heavy lifting on
            tax, payment processing, reminders, and accounting entries.
          </p>
          <p className="mt-2">
            Each invoice form has a provider toggle: QBO by default, or
            Stripe for the rare cases. Webhook events from QBO mirror
            paid / voided status back into the client portal
            automatically.
          </p>
        </Step>

        <Step
          icon={<HeartPulse className="w-6 h-6 text-tbb-blue" strokeWidth={1.75} aria-hidden />}
          title="Track the subscription assets you maintain"
          href="/coach/subscriptions"
          hrefLabel="Open Subscriptions"
        >
          <p>
            The Workplaces default billing model is Model C — Productized
            Retention. You maintain client-facing infrastructure
            (Netlify apps, Make.com, Resend, Clerk, custom domains)
            under your accounts indefinitely, even after the Business Buildering
            engagement ends.
          </p>
          <p className="mt-2">
            Subscriptions inventories each external service per
            engagement, who pays for it, what it costs per month, and
            the transfer status if/when the client takes ownership.
          </p>
        </Step>
      </Phase>

      <Phase number="07" label="Renew" caption="Compound, don't churn">
        <Step
          icon={<Sparkles className="w-6 h-6 text-tbb-blue" strokeWidth={1.75} aria-hidden />}
          title="Generate a renewal proposal"
          href="/coach/pipeline"
          hrefLabel="(from each engagement)"
        >
          <p>
            Two to four weeks before the engagement end date, Claude
            Opus drafts a renewal proposal from the Soul File, recent
            BBS notes, and outstanding deliverables. You edit, sign
            (your stored signature applies automatically), and send
            back through the Signing flow.
          </p>
          <p className="mt-2 text-sm text-tbb-ink-3">
            Renewed engagements continue; graduated engagements
            transition via the Subscriptions module to Model A
            (transfer at end) or Model B (client-owned from day one).
          </p>
        </Step>
      </Phase>

      <section className="border-t border-tbb-line-soft pt-8 space-y-4">
        <h2 className="text-tbb-h2 font-bold text-tbb-navy tracking-tbb-tight">
          Where things live
        </h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <CheatSheetItem
            href="/coach"
            label="Business Builder Console — your home base"
            icon={<CheckSquare className="w-4 h-4 text-tbb-blue" aria-hidden />}
          />
          <CheatSheetItem
            href="/coach/pipeline"
            label="Pipeline — prospects by stage"
            icon={<Filter className="w-4 h-4 text-tbb-blue" aria-hidden />}
          />
          <CheatSheetItem
            href="/coach/engagements/new"
            label="New engagement — provision a client portal"
            icon={<Sparkles className="w-4 h-4 text-tbb-blue" aria-hidden />}
          />
          <CheatSheetItem
            href="/coach/deliverables"
            label="Deliverables — the nine types"
            icon={<FileText className="w-4 h-4 text-tbb-blue" aria-hidden />}
          />
          <CheatSheetItem
            href="/coach/invoices/new"
            label="Invoices — QBO billing"
            icon={<CreditCard className="w-4 h-4 text-tbb-blue" aria-hidden />}
          />
          <CheatSheetItem
            href="/coach/subscriptions"
            label="Subscriptions — Model C inventory"
            icon={<HeartPulse className="w-4 h-4 text-tbb-blue" aria-hidden />}
          />
          <CheatSheetItem
            href="/coach/profile/signature"
            label="My signature — for auto-sign"
            icon={<PenSquare className="w-4 h-4 text-tbb-blue" aria-hidden />}
          />
          <CheatSheetItem
            href="/coach/profile/quickbooks"
            label="QuickBooks connection"
            icon={<CreditCard className="w-4 h-4 text-tbb-blue" aria-hidden />}
          />
          <CheatSheetItem
            href="/coach/hiring"
            label="Hiring — TTI candidates pipeline"
            icon={<UserCheck className="w-4 h-4 text-tbb-blue" aria-hidden />}
          />
          <CheatSheetItem
            href="/coach/soul-search"
            label="Soul File semantic search"
            icon={<Folder className="w-4 h-4 text-tbb-blue" aria-hidden />}
          />
        </ul>
      </section>

      <section className="border-t border-tbb-line-soft pt-8 space-y-3">
        <h2 className="text-tbb-h3 font-bold text-tbb-navy tracking-tbb-tight">
          What this guide doesn&apos;t cover
        </h2>
        <p className="text-tbb-ink-2">
          The portal works alongside a few external tools that stay
          outside this software:
        </p>
        <ul className="list-disc pl-5 space-y-1 text-tbb-ink-2">
          <li>
            <strong className="text-tbb-navy">TTI TriMetrix HD</strong> —
            you configure job profiles and send assessments in TTI Admin
            at <code className="font-mono text-sm">ttisi.com</code>. The
            gap report PDF is uploaded to the candidate record here.
          </li>
          <li>
            <strong className="text-tbb-navy">Fireflies</strong> — the
            transcript service for your BBS recordings. Paste the
            recording ID into the session detail page and we pull the
            transcript via API.
          </li>
          <li>
            <strong className="text-tbb-navy">QuickBooks Online</strong>{" "}
            — accounting, tax, and payment processing. We post invoices
            to QBO; QBO does the rest.
          </li>
        </ul>
      </section>
    </main>
  );
}

function Phase({
  number,
  label,
  caption,
  children,
}: {
  number: string;
  label: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <section className="relative space-y-6 pl-12 sm:pl-16">
      <div className="absolute left-0 top-0 bottom-0 flex flex-col items-center">
        <span className="text-tbb-h3 font-black text-tbb-blue tabular-nums">
          {number}
        </span>
        <span className="w-px flex-1 bg-tbb-line mt-2" aria-hidden />
      </div>
      <header className="space-y-1">
        <p className="tbb-eyebrow">Phase {number}</p>
        <h2 className="text-tbb-h2 font-bold text-tbb-navy tracking-tbb-tight">
          {label}
        </h2>
        <p className="text-tbb-lead text-tbb-ink-3">{caption}</p>
      </header>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

function Step({
  icon,
  title,
  href,
  hrefLabel,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  href: string;
  hrefLabel: string;
  children: React.ReactNode;
}) {
  const isLinkable = !href.includes("[");
  return (
    <article className="space-y-2">
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="flex-none">{icon}</span>
        <h3 className="text-tbb-h4 font-bold text-tbb-navy tracking-tbb-tight">
          {title}
        </h3>
        {isLinkable ? (
          <Link
            href={href}
            className="text-xs font-bold uppercase tracking-tbb-caps text-tbb-blue hover:underline"
          >
            {hrefLabel} <ArrowRight className="inline w-3 h-3" aria-hidden />
          </Link>
        ) : (
          <span className="text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            {hrefLabel}
          </span>
        )}
      </div>
      <div className="text-tbb-ink-2 leading-relaxed">{children}</div>
    </article>
  );
}

function CheatSheetItem({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-2.5 px-3 py-2.5 rounded-md border border-tbb-line bg-white hover:bg-tbb-bg-soft hover:border-tbb-blue transition-colors duration-tbb-base"
      >
        {icon}
        <span className="text-sm font-bold text-tbb-navy">{label}</span>
      </Link>
    </li>
  );
}

// Avoid unused import lint warnings — kept ready for future steps.
void Briefcase;
