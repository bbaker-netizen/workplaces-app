/**
 * Coach welcome / operating guide.
 *
 * The end-to-end manual for a new Coach (Bruce, Jen, future hires)
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
  MessagesSquare,
  PenSquare,
  Sparkles,
  Target,
  UserCheck,
} from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { TakeTheTourButton } from "@/components/business-builder/TakeTheBusinessBuilderTourButton";
import { LifecycleOverview } from "@/components/business-builder/LifecycleOverview";
import { ModuleReference } from "@/components/business-builder/ModuleReference";

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
            href="#module-reference"
            className="inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-tbb-caps px-5 py-2.5 rounded-pill bg-tbb-navy text-white hover:bg-tbb-navy-700 transition-colors duration-tbb-base"
          >
            Jump to module reference ↓
          </Link>
          <Link
            href="/business-builder"
            className="inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-tbb-caps px-5 py-2.5 rounded-pill border border-tbb-navy text-tbb-navy hover:bg-tbb-bg-soft transition-colors duration-tbb-base"
          >
            Open Business Builder Console
          </Link>
        </div>
      </header>

      {/* High-level animated overview — the lifecycle in five phases at
          a glance, before any reading. */}
      <section className="space-y-3">
        <div className="text-center space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-blue-light">
            The engagement lifecycle
          </p>
          <h2 className="text-tbb-h3 font-bold text-tbb-navy">
            How a coaching relationship moves through the app
          </h2>
        </div>
        <LifecycleOverview />
      </section>

      <section className="border-t border-tbb-line-soft pt-8 space-y-4">
        <h2 className="text-tbb-h3 font-bold text-tbb-navy tracking-tbb-tight">
          Three things to know first
        </h2>
        <ul className="space-y-3 text-tbb-ink-2">
          <li>
            <strong className="text-tbb-navy">Builder Buddy</strong> — the
            little orange beacon bottom-right of every page. Click it
            to chat with the in-app AI assistant. Knows the app, knows
            the methodology, knows what page you&apos;re on. Use it when
            you&apos;d otherwise ask &quot;how do I do X here?&quot;
          </li>
          <li>
            <strong className="text-tbb-navy">Templates & signatures hub</strong>{" "}
            — every reusable email template, your e-signature image
            (for contracts), and your email signature (rich editor with
            bold, lists, emoji glyphs as icons) live at{" "}
            <Link href="/business-builder/templates" className="text-tbb-blue underline">
              /business-builder/templates
            </Link>
            . Templates support variables ({"{{contact_first_name}}"} etc.)
            and resolve automatically when you send.
          </li>
          <li>
            <strong className="text-tbb-navy">Email = real HTML email</strong>
            {" "}— every send goes through your connected Gmail as
            multipart/alternative, so bold, lists, links, and emoji
            render correctly in the recipient&apos;s inbox. Your
            signature is auto-appended. Attach files via the paperclip
            (up to ~24MB).
          </li>
        </ul>
      </section>

      <section className="border-t border-tbb-line-soft pt-8 space-y-4">
        <h2 className="text-tbb-h2 font-bold text-tbb-navy tracking-tbb-tight">
          First — connect your tools
        </h2>
        <p className="text-tbb-ink-2 max-w-prose">
          A few connections you make once, yourself. Each Business Builder
          connects their own — this is how the app sends from <em>your</em>{" "}
          Gmail, syncs <em>your</em> calendar, and signs with{" "}
          <em>your</em> name.
        </p>
        <ul className="space-y-3 text-tbb-ink-2">
          <li>
            <strong className="text-tbb-navy">Google — Calendar, Gmail & Drive</strong>{" "}
            —{" "}
            <Link href="/business-builder/profile/google-calendar" className="text-tbb-blue underline">
              connect your Google account
            </Link>
            . One connection powers three things: two-way Calendar sync (BBS
            sessions sync both ways, and any calendar event with a client
            attendee auto-creates a session), Gmail capture into your Inbox,
            and Google Drive folders per client.
          </li>
          <li>
            <strong className="text-tbb-navy">QuickBooks Online</strong> —{" "}
            <Link href="/business-builder/profile/quickbooks" className="text-tbb-blue underline">
              connect your QBO
            </Link>{" "}
            so the app reads each client&apos;s payments back as their pipeline
            Value. You still invoice in QBO directly.
          </li>
          <li>
            <strong className="text-tbb-navy">Your signature</strong> — upload
            your{" "}
            <Link href="/business-builder/profile/signature" className="text-tbb-blue underline">
              e-signature image
            </Link>{" "}
            (so contracts auto-sign with your name) and set your{" "}
            <Link href="/business-builder/settings/profile#email-signature" className="text-tbb-blue underline">
              email signature
            </Link>{" "}
            (Settings &rarr; Profile).
          </li>
          <li>
            <strong className="text-tbb-navy">Ask Buddy &mdash; your Claude key</strong>{" "}
            &mdash; Ask Buddy is your in-app assistant, and it runs on your own
            Anthropic (Claude) API key so usage bills to you. Create a key at{" "}
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-tbb-blue underline"
            >
              console.anthropic.com
            </a>{" "}
            (API keys &rarr; Create key), then paste it under{" "}
            <Link
              href="/business-builder/settings/profile#ask-buddy"
              className="text-tbb-blue underline"
            >
              Settings &rarr; Profile &rarr; Ask Buddy
            </Link>
            . Until you add a key, Ask Buddy will prompt you to set one.
          </li>
        </ul>
        <p className="text-sm text-tbb-ink-3 max-w-prose">
          <strong>Text messaging (SMS):</strong> the texting service is set up
          once for the practice by the master admin, but each Business Builder
          has their own number so clients see <em>you</em>, not someone else.
          Add the Twilio number assigned to you under{" "}
          <Link
            href="/business-builder/settings/profile#sms-number"
            className="text-tbb-blue underline"
          >
            Settings &rarr; Profile &rarr; Your text (SMS) number
          </Link>
          . You send and reply to texts right in the app from the Inbox, and
          every message is logged on the client. (The Netlify cloud account for
          embedded apps is still a master-admin, practice-wide setup.)
        </p>
      </section>

      <Phase number="01" label="Pipeline" caption="Bring new prospects in">
        <Step
          icon={<Filter className="w-6 h-6 text-tbb-blue" strokeWidth={1.75} aria-hidden />}
          title="See every prospect in flight"
          href="/business-builder/pipeline"
          hrefLabel="Open the Pipeline"
        >
          <p>
            Your Pipeline is the CRM. Every prospect with their contact
            info, deal value, owner, and next action — in one sortable
            table. Stages run: New lead → First contact → Meeting
            scheduled → Diagnostic complete → Proposal sent → Negotiation
            → Contract sent → Contract signed → Onboarded → Lost. Click
            the stage chip on any row to move it. Click the company name
            to open the full prospect page where you can email, schedule
            meetings, send the diagnostic, and send for signature — all
            from one place.
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

        <Step
          icon={<Sparkles className="w-6 h-6 text-tbb-blue" strokeWidth={1.75} aria-hidden />}
          title="Lead sources — leads land automatically"
          href="/business-builder/pipeline"
          hrefLabel="Open the Pipeline"
        >
          <p>
            Leads from your marketing now flow straight into the Pipeline on
            their own. Your website contact form (Formidable on
            4workplaces.com) and your Facebook / Instagram lead ads both post
            into the app through Make.com, creating a New lead the moment
            someone fills them out. No copy-pasting.
          </p>
          <p className="mt-2">
            Every lead is tagged with where it came from. Turn on the{" "}
            <strong>Lead source</strong> column (the Columns button) and use
            the <strong>All sources</strong> filter to slice the board by
            channel &mdash; Facebook Ads, Website Form, Referral, and so on
            &mdash; so you can see which channel is actually producing.
          </p>
          <p className="mt-2 text-sm text-tbb-ink-3">
            Cleaning up: archive a lead or client from their detail page, and
            in the Archived view (the filter dropdown) you can permanently
            delete archived leads you&apos;re sure about. Use the &quot;Back to
            Prospects &amp; Clients&quot; button to step out of the Archived
            view.
          </p>
        </Step>
      </Phase>

      <Phase number="02" label="Sign" caption="Lock the engagement in writing">
        <Step
          icon={<FileSignature className="w-6 h-6 text-tbb-blue" strokeWidth={1.75} aria-hidden />}
          title="Send for signature"
          href="/business-builder/templates"
          hrefLabel="Set up your signature"
        >
          <p>
            Open any prospect, scroll to the Signing section, click{" "}
            <strong>Send for signature</strong>. Upload your contract
            PDF, add up to four signers (their contact email + name +
            role), optional message, optional &quot;auto-sign as me&quot;
            (only enabled if you&apos;ve uploaded your e-signature image at{" "}
            <Link href="/business-builder/templates" className="text-tbb-blue underline">
              Templates &amp; signatures
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
          href="/business-builder/engagements/new"
          hrefLabel="Open new engagement form"
        >
          <p>
            Once the contract is signed, open{" "}
            <Link href="/business-builder/engagements/new" className="text-tbb-blue underline">
              /business-builder/engagements/new
            </Link>
            . Fill in:
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Engagement name (the client&apos;s business name)</li>
            <li>Engagement type — Accelerator or Implementer</li>
            <li>Client lead full name + email (their portal invitation)</li>
            <li>Planned start date</li>
            <li>
              <strong>Auto-send onboarding email</strong> — optional. Pick
              one of your templates marked <code className="font-mono text-sm">onboarding</code>{" "}
              and we fire it right after the portal invitation, from your
              Gmail, signature appended. Build templates at{" "}
              <Link href="/business-builder/templates" className="text-tbb-blue underline">
                /business-builder/templates
              </Link>
              .
            </li>
          </ul>
          <p className="mt-2">
            Submitting sets up the client&apos;s private workspace and emails
            the client lead a sign-up invitation. Their first sign-in
            lands them on the client portal with the Welcome tour.
          </p>
        </Step>

        <Step
          icon={<CheckSquare className="w-6 h-6 text-tbb-blue" strokeWidth={1.75} aria-hidden />}
          title="Set up the client's portal — modules, apps & invite"
          href="/business-builder/engagements"
          hrefLabel="Open your engagements"
        >
          <p>
            Open the engagement to reach its <strong>workspace page</strong> —
            the per-client command center. Three things you&apos;ll do here:
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>
              <strong>Choose what the client sees.</strong> The portal module
              toggles let you turn modules on/off for this specific client.
              Everything is on by default — switch off what they don&apos;t
              need so their portal stays focused.
            </li>
            <li>
              <strong>Add apps to their portal (Embedded Apps).</strong> Two
              steps: first sync your Netlify projects under{" "}
              <Link href="/business-builder/library" className="text-tbb-blue underline">
                Client tools &amp; tutorials
              </Link>
              , then on the engagement page pick a project, name it for the
              client, and set its auth mode. It shows up as a widget in their
              portal under &quot;Apps.&quot;
            </li>
            <li>
              <strong>Invite the client.</strong> The <strong>Invite client</strong>{" "}
              button sends their portal sign-up email. You can prepare the
              engagement first (modules, apps, Soul File) and invite later —
              inviting is separate from creating the engagement.
            </li>
          </ul>
        </Step>

        <Step
          icon={<Folder className="w-6 h-6 text-tbb-blue" strokeWidth={1.75} aria-hidden />}
          title="Connect Google Drive for each client"
          href="/business-builder/drive-link"
          hrefLabel="(Auto-link Drive folders)"
        >
          <p>
            One Google connection at{" "}
            <Link href="/business-builder/profile/google-calendar" className="text-tbb-blue underline">
              /business-builder/profile/google-calendar
            </Link>{" "}
            powers four things: two-way Calendar sync for BBS sessions (and
            calendar events with a client attendee auto-create sessions),
            Gmail capture into the Inbox, the Meeting-notes recaps, and
            Google Drive.
          </p>
          <p className="mt-2">
            Open a client&apos;s Drive panel from the{" "}
            <span className="font-bold">Documents &amp; Drive</span> button
            on their engagement page. Two ways to wire Drive:
          </p>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            <li>
              <span className="font-bold">Create managed folder</span> — the
              app makes a folder in your Drive and keeps it in sync{" "}
              <span className="font-bold">both ways</span>: files uploaded in
              The Builder land in Drive, and files you drop in the Drive
              folder show in the client&apos;s portal.
            </li>
            <li>
              <span className="font-bold">Link an existing folder</span> —
              paste a share URL for a read-only mirror. To do this in bulk,{" "}
              <Link href="/business-builder/drive-link" className="text-tbb-blue underline">
                Auto-link Drive folders
              </Link>{" "}
              scans your Drive and matches folders to clients by name.
            </li>
          </ul>
        </Step>

        <Step
          icon={<Sparkles className="w-6 h-6 text-tbb-blue" strokeWidth={1.75} aria-hidden />}
          title="Write the Soul File"
          href="/business-builder/soul-file/[engagementId]"
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
          href="/business-builder/sessions/[engagementId]"
          hrefLabel="(from each engagement)"
        >
          <p>
            Two BBS per month per client: one in person, one virtual.
            Two hours each. Add the date and time in Mountain Time;
            the client sees their local format.
          </p>
          <p className="mt-2">
            For prospect meetings, the <strong>Get on the books</strong>{" "}
            button on any prospect page sends a real Google Calendar
            invite. Title defaults to &quot;Business Building Session.&quot;
            Pick Video and a Google Meet link gets generated automatically
            and stored as the location. Repeat is optional — weekly,
            biweekly, or monthly (RRULE). Paste any Drive share URL into
            the Attachments slot and it rides along on the invite as a
            one-click attachment; non-Drive URLs (Notion, Loom) get
            listed in the description.
          </p>
          <p className="mt-2">
            On any BBS session detail page you can paste in a Fireflies
            recording ID. The system pulls the transcript and Claude
            extracts proposed action items as drafts — you review,
            assign, and publish them within 24 hours.
          </p>
          <p className="mt-2">
            Hit <strong>Sync from Fireflies</strong> on a client&apos;s
            Meetings page to pull every recorded meeting&apos;s recap. Each
            client also gets a <strong>Meeting notes</strong> section in
            their own portal with the recaps and a one-click link to the
            recording — so they can revisit any session.
          </p>
        </Step>

        <Step
          icon={<CheckSquare className="w-6 h-6 text-tbb-blue" strokeWidth={1.75} aria-hidden />}
          title="Manage action items"
          href="/business-builder/action-items"
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
          href="/business-builder/communication/[engagementId]"
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
          href="/business-builder/deliverables"
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
          href="/business-builder/hiring"
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
          href="/business-builder/goals"
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

      <Phase number="06" label="Bill" caption="Billing lives in QuickBooks">
        <Step
          icon={<CreditCard className="w-6 h-6 text-tbb-blue" strokeWidth={1.75} aria-hidden />}
          title="Bill in QuickBooks; The Builder reads it back"
          href="/business-builder/profile/quickbooks"
          hrefLabel="Connect QuickBooks"
        >
          <p>
            Billing happens directly in QuickBooks Online — you invoice
            clients there as you always have. Connect QBO once at{" "}
            <Link href="/business-builder/profile/quickbooks" className="text-tbb-blue underline">
              /business-builder/profile/quickbooks
            </Link>
            .
          </p>
          <p className="mt-2">
            The Builder doesn&apos;t create invoices. Instead it reads each
            client&apos;s lifetime payments from QuickBooks and shows them
            as the &quot;Value&quot; on your pipeline — refreshed nightly,
            or on demand via &quot;Sync now&quot; on the QuickBooks
            settings page.
          </p>
        </Step>
      </Phase>

      <Phase number="07" label="Renew" caption="Compound, don't churn">
        <Step
          icon={<Sparkles className="w-6 h-6 text-tbb-blue" strokeWidth={1.75} aria-hidden />}
          title="Generate a renewal proposal"
          href="/business-builder/pipeline"
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

      {profile.role === "master_admin" && (
        <section className="border-t border-tbb-line-soft pt-8 space-y-4">
          <h2 className="text-tbb-h2 font-bold text-tbb-navy tracking-tbb-tight">
            Managing your team
          </h2>
          <p className="text-tbb-ink-2 max-w-prose">
            As the practice grows, invite other Business Builders from{" "}
            <Link
              href="/business-builder/settings/team"
              className="text-tbb-blue underline"
            >
              Settings → Business Builders
            </Link>
            . Add them as a <strong>Standard Business Builder</strong> (full
            coaching console, no system settings) or a{" "}
            <strong>Master admin</strong> (everything). They get an email
            invitation and land in the console on sign-in.
          </p>
          <p className="text-tbb-ink-2 max-w-prose">
            For each standard Business Builder you can scope their reach:
            expand the <strong>Access</strong> control on their row to limit
            which <strong>clients</strong> they see (all, or only selected
            ones) and which <strong>console modules</strong> they can use.
            Everyone has full access by default — the controls only appear
            once a standard Business Builder is on the team, and master
            admins always keep full access.
          </p>
        </section>
      )}

      <section className="border-t border-tbb-line-soft pt-8 space-y-4">
        <h2 className="text-tbb-h2 font-bold text-tbb-navy tracking-tbb-tight">
          Where things live
        </h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <CheatSheetItem
            href="/business-builder"
            label="Business Builder Console — your home base"
            icon={<CheckSquare className="w-4 h-4 text-tbb-blue" aria-hidden />}
          />
          <CheatSheetItem
            href="/business-builder/pipeline"
            label="Pipeline — prospects by stage"
            icon={<Filter className="w-4 h-4 text-tbb-blue" aria-hidden />}
          />
          <CheatSheetItem
            href="/business-builder/engagements/new"
            label="New engagement — provision a client portal"
            icon={<Sparkles className="w-4 h-4 text-tbb-blue" aria-hidden />}
          />
          <CheatSheetItem
            href="/business-builder/deliverables"
            label="Deliverables — the nine types"
            icon={<FileText className="w-4 h-4 text-tbb-blue" aria-hidden />}
          />
          <CheatSheetItem
            href="/business-builder/templates"
            label="Templates & signatures — emails, contract sig, email sig"
            icon={<PenSquare className="w-4 h-4 text-tbb-blue" aria-hidden />}
          />
          <CheatSheetItem
            href="/business-builder/profile/quickbooks"
            label="QuickBooks connection"
            icon={<CreditCard className="w-4 h-4 text-tbb-blue" aria-hidden />}
          />
          <CheatSheetItem
            href="/business-builder/templates"
            label="Email templates — onboarding, contract, follow-up"
            icon={<FileText className="w-4 h-4 text-tbb-blue" aria-hidden />}
          />
          <CheatSheetItem
            href="/business-builder/inbox"
            label="Inbox — all email / SMS / call history (reply & compose)"
            icon={<MessagesSquare className="w-4 h-4 text-tbb-blue" aria-hidden />}
          />
          <CheatSheetItem
            href="/business-builder/calendar"
            label="Calendar — sessions, due dates & targets across clients"
            icon={<CalendarClock className="w-4 h-4 text-tbb-blue" aria-hidden />}
          />
          <CheatSheetItem
            href="/business-builder/soul-search"
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
            — you invoice clients directly in QBO. The Builder reads each
            client&apos;s payments back and shows them as pipeline Value.
          </li>
        </ul>
      </section>

      <ModuleReference />
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
