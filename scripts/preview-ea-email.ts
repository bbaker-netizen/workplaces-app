/**
 * Render an EA email to an HTML file WITHOUT sending it.
 *
 * The point is to review copy and layout against the real template
 * rather than a mockup: this imports `dailyDigestEmail` itself, so what
 * lands in the output file is byte-for-byte what Resend would deliver.
 *
 * Usage:
 *   npx tsx scripts/preview-ea-email.ts digest [outputPath]
 *   npx tsx scripts/preview-ea-email.ts rollup [outputPath]
 *
 * The sample data below is representative, not real — invented clients
 * and commitments shaped like a normal Tuesday, so every section of the
 * email has something in it. Sections with no rows disappear entirely in
 * a live send; this deliberately fills all of them so nothing is missed
 * in review.
 *
 * Runs standalone because `lib/email/templates.ts` only needs Luxon at
 * runtime — its other two imports are `import type`, which the compiler
 * erases. No database, no network, no keys.
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DateTime } from "luxon";
import { dailyDigestEmail, fridayRollupEmail } from "../lib/email/templates";
import type { DigestPayload } from "../lib/ea/digest-data";
import type { JobHeartbeat } from "../lib/ea/job-runs";

const ZONE = "America/Edmonton";
process.env.NEXT_PUBLIC_APP_URL ??= "https://workplaces-the-builder.netlify.app";

/** A Tuesday morning, so the day names in the sample read sensibly. */
const now = DateTime.fromISO("2026-07-28T07:00:00", { zone: ZONE });

const iso = (d: DateTime) => d.toJSDate().toISOString();
const when = (d: DateTime) => d.toFormat("ccc d LLL, h:mm a");

const payload: DigestPayload = {
  version: 1,
  generatedAt: iso(now),
  forDate: now.toFormat("yyyy-MM-dd"),
  recipientName: "Bruce Baker",

  todaysSessions: [
    {
      id: "s1",
      engagementId: "e1",
      engagementLabel: "Summit Cabinets",
      title: null,
      scheduledAt: iso(now.set({ hour: 10, minute: 0 })),
      type: "in_person",
      whenLabel: when(now.set({ hour: 10, minute: 0 })),
      previousSessionAt: iso(now.minus({ days: 14 })),
      proposedAgenda: {
        proposalId: "prop-1",
        approveUrl:
          "https://builder.4workplaces.com/api/ea/approve/SAMPLE-AGENDA-TOKEN",
        items: [
          {
            title: "Second shift start date",
            body: "Left unresolved last session pending the job-costing numbers.",
          },
          {
            title: "Shop-floor org chart sign-off",
            body: "Six days past its date and blocking the hiring conversation.",
          },
          { title: "Q2 job costing, what the numbers say", body: null },
          {
            title: "Estimator role, scope before we advertise",
            body: null,
          },
        ],
      },
      openCommitments: [
        { id: "c1", title: "Finish the shop-floor org chart", assigneeName: "Bruce Baker" },
        { id: "c2", title: "Pull Q2 job-costing numbers", assigneeName: "Dave Mercer" },
        { id: "c3", title: "Decide on the second shift start date", assigneeName: "Dave Mercer" },
      ],
    },
  ],

  myItems: {
    overdue: [
      {
        id: "a1",
        title: "Finish the shop-floor org chart",
        engagementId: "e1",
        engagementLabel: "Summit Cabinets",
        dueDate: iso(now.minus({ days: 6 })),
        status: "in_progress",
        estimatedMinutes: 120,
        assigneeName: "Bruce Baker",
        daysOverdue: 6,
      },
      {
        id: "a2",
        title: "Draft the marketing plan outline",
        engagementId: "e2",
        engagementLabel: "Crown and Ember",
        dueDate: iso(now.minus({ days: 2 })),
        status: "open",
        estimatedMinutes: 90,
        assigneeName: "Bruce Baker",
        daysOverdue: 2,
      },
    ],
    today: [
      {
        id: "a3",
        title: "Send the revised proposal to Aiyana",
        engagementId: "e3",
        engagementLabel: "Aiyana Services",
        dueDate: iso(now.set({ hour: 17 })),
        status: "open",
        estimatedMinutes: 45,
        assigneeName: "Bruce Baker",
        daysOverdue: null,
      },
    ],
    thisWeek: [
      {
        id: "a4",
        title: "Build the hiring scorecard for the estimator role",
        engagementId: "e4",
        engagementLabel: "North Central Farming",
        dueDate: iso(now.plus({ days: 3 }).set({ hour: 12 })),
        status: "open",
        estimatedMinutes: 60,
        assigneeName: "Bruce Baker",
        daysOverdue: null,
      },
      {
        id: "a5",
        title: "Review the safety SOP draft",
        engagementId: "e5",
        engagementLabel: "A&M Abatement",
        dueDate: iso(now.plus({ days: 4 }).set({ hour: 15 })),
        status: "open",
        estimatedMinutes: 30,
        assigneeName: "Bruce Baker",
        daysOverdue: null,
      },
    ],
  },

  clientOverdue: [
    {
      id: "b1",
      title: "Pull Q2 job-costing numbers",
      engagementId: "e1",
      engagementLabel: "Summit Cabinets",
      dueDate: iso(now.minus({ days: 9 })),
      status: "open",
      estimatedMinutes: 60,
      assigneeName: "Dave Mercer",
      daysOverdue: 9,
    },
    {
      id: "b2",
      title: "Confirm the new pay bands with the partners",
      engagementId: "e4",
      engagementLabel: "North Central Farming",
      dueDate: iso(now.minus({ days: 3 })),
      status: "open",
      estimatedMinutes: 60,
      assigneeName: "Sandra Toews",
      daysOverdue: 3,
    },
  ],

  deliverablesByStatus: [
    {
      status: "in_progress",
      items: [
        {
          id: "d1",
          title: "Org chart and role definitions",
          type: "org_chart",
          status: "in_progress",
          engagementId: "e1",
          engagementLabel: "Summit Cabinets",
          daysInState: 19,
          targetDate: iso(now.minus({ days: 4 })),
          daysPastTarget: 4,
        },
        {
          id: "d2",
          title: "Marketing plan",
          type: "marketing_plan",
          status: "in_progress",
          engagementId: "e2",
          engagementLabel: "Crown and Ember",
          daysInState: 6,
          targetDate: iso(now.plus({ days: 10 })),
          daysPastTarget: null,
        },
      ],
    },
    {
      status: "review",
      items: [
        {
          id: "d3",
          title: "Financial dashboard",
          type: "financial_dashboard",
          status: "review",
          engagementId: "e3",
          engagementLabel: "Aiyana Services",
          daysInState: 11,
          targetDate: null,
          daysPastTarget: null,
        },
      ],
    },
  ],

  deliverablesPastTarget: [
    {
      id: "d1",
      title: "Org chart and role definitions",
      type: "org_chart",
      status: "in_progress",
      engagementId: "e1",
      engagementLabel: "Summit Cabinets",
      daysInState: 19,
      targetDate: iso(now.minus({ days: 4 })),
      daysPastTarget: 4,
    },
  ],

  upcomingSessions: [
    {
      id: "s1",
      engagementId: "e1",
      engagementLabel: "Summit Cabinets",
      title: null,
      scheduledAt: iso(now.set({ hour: 10 })),
      type: "in_person",
      whenLabel: when(now.set({ hour: 10 })),
    },
    {
      id: "s2",
      engagementId: "e2",
      engagementLabel: "Crown and Ember",
      title: null,
      scheduledAt: iso(now.plus({ days: 2 }).set({ hour: 9 })),
      type: "virtual",
      whenLabel: when(now.plus({ days: 2 }).set({ hour: 9 })),
    },
    {
      id: "s3",
      engagementId: "e5",
      engagementLabel: "A&M Abatement",
      title: null,
      scheduledAt: iso(now.plus({ days: 5 }).set({ hour: 13, minute: 30 })),
      type: "in_person",
      whenLabel: when(now.plus({ days: 5 }).set({ hour: 13, minute: 30 })),
    },
  ],

  escalations: [
    {
      blockId: "blk-0",
      actionItemId: "a1",
      title: "Finish the shop-floor org chart",
      engagementLabel: "Summit Cabinets",
      rescheduleCount: 1,
      blockEndedAt: iso(now.minus({ days: 1 }).set({ hour: 15 })),
      estimatedMinutes: 120,
      notice:
        "Second miss. Two blocks have now gone by without this moving — worth asking whether the estimate is wrong.",
      severity: "warning",
    },
  ],

  prospectsWithoutNextStep: [
    {
      id: "p1",
      companyName: "Redline Mechanical",
      contactName: "Tom Whyte",
      status: "appt_completed_followup",
      lastActivityAt: iso(now.minus({ days: 11 })),
    },
    {
      id: "p2",
      companyName: "Bridgeport Electric",
      contactName: "Alicia Fenn",
      status: "proposal_sent",
      lastActivityAt: iso(now.minus({ days: 5 })),
    },
  ],

  quietEngagements: [
    {
      engagementId: "e5",
      engagementLabel: "A&M Abatement",
      lastSessionAt: iso(now.minus({ days: 21 })),
      lastItemMovementAt: iso(now.minus({ days: 18 })),
      quietDays: 18,
    },
  ],

  proposedBlocks: [
    {
      blockId: "blk-1",
      actionItemId: "a1",
      title: "Finish the shop-floor org chart",
      engagementLabel: "Summit Cabinets",
      start: iso(now.set({ hour: 13, minute: 0 })),
      end: iso(now.set({ hour: 15, minute: 0 })),
      whenLabel: `${when(now.set({ hour: 13 }))} – 3:00 PM`,
      approveUrl: "https://workplaces-the-builder.netlify.app/api/ea/approve/SAMPLE-TOKEN-1",
      rescheduleCount: 1,
    },
    {
      blockId: "blk-2",
      actionItemId: "a2",
      title: "Draft the marketing plan outline",
      engagementLabel: "Crown and Ember",
      start: iso(now.plus({ days: 1 }).set({ hour: 9, minute: 0 })),
      end: iso(now.plus({ days: 1 }).set({ hour: 10, minute: 30 })),
      whenLabel: `${when(now.plus({ days: 1 }).set({ hour: 9 }))} – 10:30 AM`,
      approveUrl: "https://workplaces-the-builder.netlify.app/api/ea/approve/SAMPLE-TOKEN-2",
      rescheduleCount: 0,
    },
    {
      blockId: "blk-3",
      actionItemId: "a3",
      title: "Send the revised proposal to Aiyana",
      engagementLabel: "Aiyana Services",
      start: iso(now.set({ hour: 15, minute: 30 })),
      end: iso(now.set({ hour: 16, minute: 15 })),
      whenLabel: `${when(now.set({ hour: 15, minute: 30 }))} – 4:15 PM`,
      approveUrl: "https://workplaces-the-builder.netlify.app/api/ea/approve/SAMPLE-TOKEN-3",
      rescheduleCount: 0,
    },
  ],

  counts: { engagements: 5, myOpenItems: 5 },
};

/* ------------------------- heartbeat sample ------------------------- */

/**
 * `ranDaysAgo` is the last attempt of any outcome; `workedDaysAgo` is
 * the last attempt that succeeded (null = never). Staleness is derived
 * the same way the real loader derives it, rather than being asserted,
 * so the preview cannot drift from production behaviour.
 */
const hb = (
  jobId: string,
  label: string,
  cadence: string,
  opts: {
    ranDaysAgo?: number | null;
    workedDaysAgo?: number | null;
    items?: number;
    error?: string | null;
  },
): JobHeartbeat => {
  const ran =
    opts.ranDaysAgo === null || opts.ranDaysAgo === undefined
      ? null
      : now.minus({ days: opts.ranDaysAgo }).toJSDate();
  const worked =
    opts.workedDaysAgo === null || opts.workedDaysAgo === undefined
      ? null
      : now.minus({ days: opts.workedDaysAgo }).toJSDate();
  const stale =
    worked === null ||
    worked.getTime() < now.minus({ days: 8 }).toJSDate().getTime();
  return {
    jobId,
    label,
    cadence,
    lastRunAt: ran,
    lastStatus: ran ? (worked && ran <= worked ? "success" : "failed") : null,
    lastItems: ran ? (opts.items ?? 0) : null,
    lastSuccessAt: worked,
    lastSuccessItems: worked ? (opts.items ?? 0) : null,
    lastError: stale ? (opts.error ?? null) : null,
    stale,
  };
};

const heartbeatSample: JobHeartbeat[] = [
  hb("ea-daily-digest", "Morning briefing", "Weekday mornings", {
    ranDaysAgo: 0,
    workedDaysAgo: 0,
    items: 1,
  }),
  hb("ea-time-blocks", "Focus time proposals", "Weekday mornings", {
    ranDaysAgo: 0,
    workedDaysAgo: 0,
    items: 3,
  }),
  hb("ea-inbox-sweep", "Inbox triage", "Hourly", {
    ranDaysAgo: 0,
    workedDaysAgo: 0,
    items: 2,
  }),
  hb("ea-recap-sweep", "Session recaps", "Hourly", {
    // Healthy but idle: no sessions to recap this week. Zero must read
    // as a quiet week, not a fault.
    ranDaysAgo: 0,
    workedDaysAgo: 0,
    items: 0,
  }),
  hb("ea-client-nudge", "Client chasing", "Monday mornings", {
    // The realistic failure: worked for weeks, then the token died. Red,
    // but carrying the date it last worked rather than "never".
    ranDaysAgo: 0,
    workedDaysAgo: 11,
    items: 4,
    error:
      "Google not connected. Visit /business-builder/profile/google-calendar.",
  }),
  hb("ea-friday-rollup", "Friday rollup", "Friday afternoons", {
    // Never run at all — the case that writes no rows and would
    // otherwise be invisible.
    ranDaysAgo: null,
    workedDaysAgo: null,
  }),
];

/* --------------------------- which email --------------------------- */

const which = (process.argv[2] ?? "digest").toLowerCase();
const outArg = process.argv[3];

const envelope =
  which === "rollup"
    ? fridayRollupEmail({
        to: "bbaker@4workplaces.com",
        recipientName: payload.recipientName,
        weekLabel: `the week of ${now.startOf("week").toFormat("d LLLL")}`,
        shipped: [
          {
            title: "Interview guide for the estimator role",
            engagementLabel: "North Central Farming",
            revenueImpact: false,
            marginImpact: true,
          },
          {
            title: "Pricing review and new rate card",
            engagementLabel: "Crown and Ember",
            revenueImpact: true,
            marginImpact: true,
          },
          {
            title: "Financial dashboard (deliverable)",
            engagementLabel: "Aiyana Services",
            revenueImpact: false,
            marginImpact: true,
          },
          {
            title: "Tidy up the shared drive folders",
            engagementLabel: "Summit Cabinets",
            revenueImpact: false,
            marginImpact: false,
          },
        ],
        slipped: [
          {
            title: "Finish the shop-floor org chart",
            engagementLabel: "Summit Cabinets",
            daysOverdue: 6,
            revenueImpact: false,
            marginImpact: true,
          },
          {
            title: "Draft the marketing plan outline",
            engagementLabel: "Crown and Ember",
            daysOverdue: 2,
            revenueImpact: true,
            marginImpact: false,
          },
        ],
        // The three sections that moved out of the daily briefing.
        deliverablesByStatus: payload.deliverablesByStatus,
        deliverablesPastTarget: payload.deliverablesPastTarget,
        clientOverdue: payload.clientOverdue,
        quietEngagements: payload.quietEngagements,
        // Heartbeat. Deliberately seeded with one healthy-but-idle job
        // (zero items, which must NOT read as a fault), one stale job
        // carrying an error, and one that has never run at all — the
        // three states the section has to distinguish.
        // Hours. Seeded to show all four states the table distinguishes:
        // a thin rate (red), two healthy ones, an engagement with hours
        // but no fee recorded, and a brand new one with no hours yet.
        engagementHours: [
          {
            engagementId: "e1",
            engagementLabel: "Summit Cabinets",
            periodSessionHours: 4,
            periodBlockHours: 3.5,
            periodTotalHours: 7.5,
            toDateSessionHours: 28,
            toDateBlockHours: 19.5,
            toDateTotalHours: 47.5,
            monthlyFeeCents: 250000,
            toDateHourlyRate: 105,
            monthsElapsed: 2,
          },
          {
            engagementId: "e4",
            engagementLabel: "North Central Farming",
            periodSessionHours: 2,
            periodBlockHours: 1,
            periodTotalHours: 3,
            toDateSessionHours: 16,
            toDateBlockHours: 6,
            toDateTotalHours: 22,
            monthlyFeeCents: 300000,
            toDateHourlyRate: 273,
            monthsElapsed: 2,
          },
          {
            engagementId: "e2",
            engagementLabel: "Crown and Ember",
            periodSessionHours: 2,
            periodBlockHours: 1.5,
            periodTotalHours: 3.5,
            toDateSessionHours: 12,
            toDateBlockHours: 4.5,
            toDateTotalHours: 16.5,
            monthlyFeeCents: 350000,
            toDateHourlyRate: 424,
            monthsElapsed: 2,
          },
          {
            engagementId: "e5",
            engagementLabel: "A&M Abatement",
            periodSessionHours: 0,
            periodBlockHours: 0,
            periodTotalHours: 0,
            toDateSessionHours: 8,
            toDateBlockHours: 2,
            toDateTotalHours: 10,
            monthlyFeeCents: null,
            toDateHourlyRate: null,
            monthsElapsed: 3,
          },
          {
            engagementId: "e3",
            engagementLabel: "Aiyana Services",
            periodSessionHours: 0,
            periodBlockHours: 0,
            periodTotalHours: 0,
            toDateSessionHours: 0,
            toDateBlockHours: 0,
            toDateTotalHours: 0,
            monthlyFeeCents: 200000,
            toDateHourlyRate: null,
            monthsElapsed: 1,
          },
        ],
        heartbeats: heartbeatSample,
      })
    : dailyDigestEmail({ to: "bbaker@4workplaces.com", payload });

const htmlPath = outArg
  ? resolve(outArg)
  : resolve(`ea-${which}-preview.html`);
const textPath = htmlPath.replace(/\.html?$/i, ".txt");

writeFileSync(htmlPath, envelope.html, "utf8");
writeFileSync(textPath, envelope.text, "utf8");

console.log(`Subject: ${envelope.subject}`);
console.log(`HTML  -> ${htmlPath}`);
console.log(`Text  -> ${textPath}`);
