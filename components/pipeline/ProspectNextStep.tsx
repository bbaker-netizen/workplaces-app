/**
 * "What's next" suggestion box on the prospect detail page. Reads the
 * current stage and surfaces the obvious next move(s) — turns the
 * stage chip from a label into a guided workflow.
 *
 * Server component (no client interactivity) — just renders copy +
 * deep links into the actions already on the page.
 */

import {
  Calendar,
  CheckCircle2,
  FileText,
  Mail,
  PenSquare,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import type { ProspectStatus } from "@/lib/pipeline/stages";

type NextStep = {
  emoji: string;
  heading: string;
  body: string;
  prompts: { icon: React.ReactNode; label: string }[];
};

const STEPS_BY_STATUS: Record<ProspectStatus, NextStep> = {
  new_lead: {
    emoji: "👋",
    heading: "Fresh lead — make first contact",
    body: "Send a quick intro email or pick up the phone. The longer they sit, the colder they get.",
    prompts: [
      { icon: <Mail className="w-3.5 h-3.5" aria-hidden />, label: "Send a quick intro email (Communications panel below)" },
      { icon: <Calendar className="w-3.5 h-3.5" aria-hidden />, label: "Or jump straight to scheduling a meeting" },
    ],
  },
  first_contact: {
    emoji: "📞",
    heading: "Schedule the discovery call",
    body: "You've made contact — get a real conversation on the calendar before momentum fades.",
    prompts: [
      { icon: <Calendar className="w-3.5 h-3.5" aria-hidden />, label: "Schedule a meeting — sends a Google Calendar invite" },
      { icon: <Sparkles className="w-3.5 h-3.5" aria-hidden />, label: "Send the diagnostic so they come to the call prepared" },
    ],
  },
  meeting_scheduled: {
    emoji: "🗓️",
    heading: "Meeting is on the books",
    body: "Optional but powerful: send the diagnostic so they arrive prepped, then write your call notes here after.",
    prompts: [
      { icon: <Sparkles className="w-3.5 h-3.5" aria-hidden />, label: "Send the diagnostic if they haven't filled it out" },
      { icon: <PenSquare className="w-3.5 h-3.5" aria-hidden />, label: "After the call, log a Note in the activity panel" },
    ],
  },
  diagnostic_pending: {
    emoji: "⏳",
    heading: "Waiting on their diagnostic",
    body: "You've sent the form. Give them a couple days; if no response, a gentle nudge works.",
    prompts: [
      { icon: <Mail className="w-3.5 h-3.5" aria-hidden />, label: "Follow up if it's been 3+ days" },
      { icon: <Calendar className="w-3.5 h-3.5" aria-hidden />, label: "Or schedule the call now without waiting" },
    ],
  },
  diagnostic_complete: {
    emoji: "✅",
    heading: "They filled it out — review and propose",
    body: "Read their answers in the Notes section below. Then craft a proposal that speaks to what they said.",
    prompts: [
      { icon: <FileText className="w-3.5 h-3.5" aria-hidden />, label: "Draft a proposal tailored to their answers" },
      { icon: <Calendar className="w-3.5 h-3.5" aria-hidden />, label: "Book the follow-up call to walk through it" },
    ],
  },
  proposal_sent: {
    emoji: "📨",
    heading: "Proposal out — keep momentum",
    body: "Most deals close in the follow-up. Give them 2–3 business days, then check in.",
    prompts: [
      { icon: <Mail className="w-3.5 h-3.5" aria-hidden />, label: "Send a friendly check-in if they go quiet" },
      { icon: <TrendingUp className="w-3.5 h-3.5" aria-hidden />, label: "When they're ready, move to Negotiation" },
    ],
  },
  negotiation: {
    emoji: "🤝",
    heading: "Negotiating — get to a yes",
    body: "Last yard before the goal line. Listen for the real objection, name it, solve it.",
    prompts: [
      { icon: <FileText className="w-3.5 h-3.5" aria-hidden />, label: "Adjust scope or pricing in the proposal if needed" },
      { icon: <PenSquare className="w-3.5 h-3.5" aria-hidden />, label: "When agreed, send the contract for signature" },
    ],
  },
  contract_sent: {
    emoji: "✍️",
    heading: "Contract is out — almost there",
    body: "They've got it. Don't chase too hard — one well-timed follow-up usually does it.",
    prompts: [
      { icon: <Mail className="w-3.5 h-3.5" aria-hidden />, label: "Nudge if not signed within 5 business days" },
    ],
  },
  contract_signed: {
    emoji: "🎉",
    heading: "Won! Time to onboard",
    body: "Big one. Create the engagement, send the kickoff invite, get them into the portal.",
    prompts: [
      { icon: <CheckCircle2 className="w-3.5 h-3.5" aria-hidden />, label: "Create the engagement from this prospect" },
      { icon: <Calendar className="w-3.5 h-3.5" aria-hidden />, label: "Schedule the kickoff session" },
    ],
  },
  onboarded: {
    emoji: "🏗️",
    heading: "Active client",
    body: "They're a Workplaces client now. Move client-facing work into their engagement.",
    prompts: [
      { icon: <Sparkles className="w-3.5 h-3.5" aria-hidden />, label: "Switch to the engagement view to work with them" },
    ],
  },
  lost: {
    emoji: "💭",
    heading: "Closed lost — leave the door open",
    body: "Not every prospect closes. A short \"keep in touch\" note now can become a deal a year from now.",
    prompts: [
      { icon: <Mail className="w-3.5 h-3.5" aria-hidden />, label: "Send a brief 'door open' email if you haven't" },
      { icon: <PenSquare className="w-3.5 h-3.5" aria-hidden />, label: "Note why it didn't close — useful for the next one" },
    ],
  },
};

export function ProspectNextStep({ status }: { status: ProspectStatus }) {
  const step = STEPS_BY_STATUS[status];
  if (!step) return null;
  return (
    <section className="border border-tbb-blue/30 rounded-lg bg-gradient-to-br from-tbb-blue-100 to-white p-5 space-y-3 shadow-tbb-sm">
      <div className="flex items-baseline gap-2">
        <span className="text-2xl leading-none" aria-hidden>
          {step.emoji}
        </span>
        <div className="space-y-0.5">
          <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-blue-700">
            What&apos;s next
          </p>
          <h2 className="text-base font-bold text-tbb-navy">{step.heading}</h2>
        </div>
      </div>
      <p className="text-sm text-tbb-ink-2 leading-relaxed">{step.body}</p>
      <ul className="space-y-1.5">
        {step.prompts.map((p, i) => (
          <li
            key={i}
            className="flex items-start gap-2 text-sm text-tbb-ink-2"
          >
            <span className="mt-0.5 text-tbb-blue">{p.icon}</span>
            <span>{p.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
