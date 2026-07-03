/**
 * "What's next" suggestion card on the prospect detail page. Reads the
 * current stage and surfaces the obvious next move with a bit of
 * personality — turns the stage chip from a dry label into a guided
 * workflow that doesn't sound like a manual.
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

// Partial: stages without a bespoke "next step" panel simply don't render
// one (the lookup below returns null). New ladder stages can get entries
// later without a type break.
const STEPS_BY_STATUS: Partial<Record<ProspectStatus, NextStep>> = {
  new_lead: {
    emoji: "👋",
    heading: "Fresh lead — say hi before they cool off",
    body: "First five minutes of contact convert nine times better than the next hour. Pick up the phone, fire off an email, just don't let them sit.",
    prompts: [
      { icon: <Mail className="w-3.5 h-3.5" aria-hidden />, label: "Send a quick intro (Communications panel below)" },
      { icon: <Calendar className="w-3.5 h-3.5" aria-hidden />, label: "Or skip the dance — get them on the calendar" },
    ],
  },
  first_contact: {
    emoji: "📞",
    heading: "You said hi. Now get a real conversation booked.",
    body: "Email tag is where deals go to die. Twenty minutes on the calendar moves the ball further than a week of follow-ups.",
    prompts: [
      { icon: <Calendar className="w-3.5 h-3.5" aria-hidden />, label: "Schedule a meeting — Google sends the invite" },
      { icon: <Sparkles className="w-3.5 h-3.5" aria-hidden />, label: "Send the diagnostic so they show up loaded with answers" },
    ],
  },
  meeting_scheduled: {
    emoji: "🗓️",
    heading: "It's on the books",
    body: "Send the diagnostic now so they show up already half-coached. After the call, dump your notes here — future-you will thank you.",
    prompts: [
      { icon: <Sparkles className="w-3.5 h-3.5" aria-hidden />, label: "Send the diagnostic if they haven't filled it out yet" },
      { icon: <PenSquare className="w-3.5 h-3.5" aria-hidden />, label: "After the call → log a Note in the activity panel" },
    ],
  },
  diagnostic_pending: {
    emoji: "⏳",
    heading: "Ball's in their court",
    body: "You sent the form. Resist the urge to nudge for at least 48 hours. If you must, blame the system: \"just making sure the email landed.\"",
    prompts: [
      { icon: <Mail className="w-3.5 h-3.5" aria-hidden />, label: "Gentle follow-up if it's been 3+ days" },
      { icon: <Calendar className="w-3.5 h-3.5" aria-hidden />, label: "Or skip the form and just get on the call" },
    ],
  },
  diagnostic_complete: {
    emoji: "✅",
    heading: "They filled it out. Time to be useful.",
    body: "Their answers are in the Notes section below. Read them like you mean it, then send a proposal that quotes their own words back to them — works every time.",
    prompts: [
      { icon: <FileText className="w-3.5 h-3.5" aria-hidden />, label: "Draft a proposal that speaks their language" },
      { icon: <Calendar className="w-3.5 h-3.5" aria-hidden />, label: "Book the walk-through call" },
    ],
  },
  proposal_sent: {
    emoji: "📨",
    heading: "Proposal's out. Now we wait. (Briefly.)",
    body: "Most deals close in the follow-up, not the proposal. Give it 2–3 business days, then check in. If you hear crickets, the proposal probably needed to be shorter.",
    prompts: [
      { icon: <Mail className="w-3.5 h-3.5" aria-hidden />, label: "Friendly check-in if they go quiet" },
      { icon: <TrendingUp className="w-3.5 h-3.5" aria-hidden />, label: "When they push back on something, move to Negotiation" },
    ],
  },
  negotiation: {
    emoji: "🤝",
    heading: "Last yard before the goal line",
    body: "Their stated objection is rarely their real objection. Slow down. Ask what's actually in the way. Solve THAT, and you'll have a client by Friday.",
    prompts: [
      { icon: <FileText className="w-3.5 h-3.5" aria-hidden />, label: "Tweak the proposal — scope, price, or pace" },
      { icon: <PenSquare className="w-3.5 h-3.5" aria-hidden />, label: "When you've got a handshake, send the contract" },
    ],
  },
  contract_sent: {
    emoji: "✍️",
    heading: "Contract's out — almost a client",
    body: "They have it. Don't chase too hard — that smells desperate. One well-timed nudge after 5 business days usually does the trick.",
    prompts: [
      { icon: <Mail className="w-3.5 h-3.5" aria-hidden />, label: "Friendly nudge if not signed in 5 business days" },
    ],
  },
  contract_signed: {
    emoji: "🎉",
    heading: "WON. Crack open something cold.",
    body: "Big one. Now: lock in the kickoff before they get distracted by their own business. Onboarding momentum sets the whole relationship.",
    prompts: [
      { icon: <CheckCircle2 className="w-3.5 h-3.5" aria-hidden />, label: "Spin up the engagement (turns them into a real client)" },
      { icon: <Calendar className="w-3.5 h-3.5" aria-hidden />, label: "Get the kickoff session on the calendar — this week if you can" },
    ],
  },
  onboarded: {
    emoji: "🏗️",
    heading: "Live client. Build what compounds.",
    body: "They're in the building now. From here on, the engagement view is home base — that's where you'll do the deep work.",
    prompts: [
      { icon: <Sparkles className="w-3.5 h-3.5" aria-hidden />, label: "Switch to their engagement and get to work" },
    ],
  },
  lost: {
    emoji: "💭",
    heading: "Closed lost — and that's okay",
    body: "Not every fish bites. The ones you lose teach you the ones you'll win. Leave a kind door-open note — surprising number of \"lost\" deals come back in six months.",
    prompts: [
      { icon: <Mail className="w-3.5 h-3.5" aria-hidden />, label: "Quick \"door's open\" email — no pressure, just warm" },
      { icon: <PenSquare className="w-3.5 h-3.5" aria-hidden />, label: "Note why it didn't close — patterns matter" },
    ],
  },
};

export function ProspectNextStep({ status }: { status: ProspectStatus }) {
  const step = STEPS_BY_STATUS[status];
  if (!step) return null;
  return (
    <section className="border border-tbb-blue/30 rounded-lg bg-gradient-to-br from-tbb-blue-100 via-tbb-cream-50 to-white p-5 space-y-3 shadow-tbb-sm">
      <div className="flex items-start gap-3">
        <span
          className="text-3xl leading-none mt-1 transition-transform duration-tbb-base hover:scale-110"
          aria-hidden
        >
          {step.emoji}
        </span>
        <div className="space-y-0.5 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-blue-700">
            What&apos;s next
          </p>
          <h2 className="text-base font-bold text-tbb-navy leading-snug">
            {step.heading}
          </h2>
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
