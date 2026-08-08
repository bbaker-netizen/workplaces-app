/**
 * What the practice sells, and what each offer demands of the person
 * buying it.
 *
 * `scheduling_links.meeting_type` used to be three flags a Builder picked
 * in a dropdown, and everything that varied between them was scattered:
 * the public chooser hard-coded `discovery`, the console kept its own
 * label list, and whether a booking created a lead was an if/else in the
 * middle of `bookSlot`. Adding a SECOND public offer with rules of its
 * own — ninety minutes, and documents that must arrive before the call —
 * would have meant repeating that scatter rather than extending it.
 *
 * So the offer is described once, here, and every surface reads it: the
 * chooser at /book, the booking page, the confirmation page, both
 * emails, and the Builder's console. A pre-work requirement in
 * particular CANNOT be left to each link's free-text description — it is
 * the whole point of "Where the money went", it has to read identically
 * on both Builders' pages, and a Builder editing their description must
 * not be able to delete it by accident.
 *
 * Deliberately pure data with no imports: this module is read by client
 * components as well as server ones.
 */

/**
 * Every value of the `scheduling_meeting_type` enum, in the order they
 * should be offered. Kept in step with lib/db/schema.ts and migration
 * 0122 — the enum is the source of truth for what the column accepts;
 * this is the source of truth for what each value MEANS.
 */
export const SCHEDULING_MEETING_TYPES = [
  "discovery",
  "where_the_money_went",
  "bbs",
  "ad_hoc",
] as const;

export type SchedulingMeetingType = (typeof SCHEDULING_MEETING_TYPES)[number];

export function isSchedulingMeetingType(v: unknown): v is SchedulingMeetingType {
  return (
    typeof v === "string" &&
    (SCHEDULING_MEETING_TYPES as readonly string[]).includes(v)
  );
}

/**
 * Work the prospect has to do BEFORE the meeting, without which the
 * meeting does not function.
 *
 * Not a nicety and not a reminder. For "Where the money went" the
 * documents ARE the session — ninety minutes with nothing to read is a
 * wasted booking for both sides — so this is stated on the booking page
 * before anyone picks a time, and again in the confirmation email.
 */
export type PrepRequirement = {
  /** Heading for the block. Short, and in the second person. */
  headline: string;
  /** One sentence on why it is required, not merely requested. */
  why: string;
  /** The actual documents. Specific enough to act on without a reply. */
  items: string[];
  /** When it has to be with us, and what happens if it isn't. */
  timing: string;
};

export type MeetingTypeDefinition = {
  value: SchedulingMeetingType;
  /** What a Business Builder sees in the console dropdown. */
  consoleLabel: string;
  /** The console's one-line explanation of what picking this does. */
  consoleHint: string;
  /**
   * Where this offer sits on the public /book chooser, lowest first.
   * `null` means it never appears there — a Business Building session is
   * shared in context with an existing client, and a one-off is by
   * definition sent to one person.
   */
  publicOrder: number | null;
  /** The offer's name on the chooser. Independent of any one link's name. */
  publicHeading: string;
  /** What the offer is, in the prospect's terms. */
  publicBlurb: string;
  /**
   * Whether booking creates (or claims) a prospect in the pipeline owned
   * by the link's Builder. Both public offers do; the private types do
   * not, because the person booking is already a client or already known.
   */
  createsProspect: boolean;
  /** `prospects.lead_source` display label for a booking of this type. */
  leadSourceLabel: string;
  /** The sensible length, offered as the default when a link is created. */
  defaultDurationMinutes: number;
  prep: PrepRequirement | null;
};

const DEFINITIONS: Record<SchedulingMeetingType, MeetingTypeDefinition> = {
  discovery: {
    value: "discovery",
    consoleLabel: "Discovery call",
    consoleHint:
      "Creates a lead in the pipeline, owned by whoever the link belongs to. Listed on the public /book page.",
    publicOrder: 1,
    publicHeading: "A first conversation",
    publicBlurb:
      "Half an hour on where your business is, where you want it, and whether we are the right people to help you get there. No pitch, no pressure, nothing to prepare.",
    createsProspect: true,
    leadSourceLabel: "Discovery booking",
    defaultDurationMinutes: 30,
    prep: null,
  },

  where_the_money_went: {
    value: "where_the_money_went",
    consoleLabel: "Where the money went",
    consoleHint:
      "Ninety minutes on the prospect's own numbers. Creates a lead in the pipeline, owned by whoever the link belongs to, and is listed on the public /book page. The booking page and the confirmation email both state the documents they have to send first.",
    publicOrder: 2,
    publicHeading: "Where the money went",
    publicBlurb:
      "Ninety minutes in your own numbers. We read twelve months of your bank statements and your P&L before we meet, then go through what we found — the spending you decided on, and the spending that just happened.",
    createsProspect: true,
    leadSourceLabel: "Where the money went booking",
    defaultDurationMinutes: 90,
    prep: {
      headline: "You send your numbers before we meet",
      why: "The documents are the session. Without them there is nothing to read and nothing to show you, so the ninety minutes cannot go ahead.",
      items: [
        "Twelve months of bank statements — every account the business uses, all twelve months, exactly as they come from the bank (PDF or CSV).",
        "A profit and loss statement covering the same twelve months.",
      ],
      timing:
        "Send them as soon as you have booked. They have to be read before we sit down, so a booking with nothing sent will be moved rather than held.",
    },
  },

  bbs: {
    value: "bbs",
    consoleLabel: "Business Building session",
    consoleHint:
      "Shared in context with an existing client. Never appears on the public booking page.",
    publicOrder: null,
    publicHeading: "Business Building session",
    publicBlurb: "",
    createsProspect: false,
    leadSourceLabel: "Business Building session booking",
    defaultDurationMinutes: 120,
    prep: null,
  },

  ad_hoc: {
    value: "ad_hoc",
    consoleLabel: "One-off meeting",
    consoleHint:
      "Sent to one person for one conversation. No lead is created, and it never appears on the public booking page.",
    publicOrder: null,
    publicHeading: "One-off meeting",
    publicBlurb: "",
    createsProspect: false,
    leadSourceLabel: "Booking",
    defaultDurationMinutes: 30,
    prep: null,
  },
};

/**
 * The definition for a type.
 *
 * Falls back to `discovery` for a value the database holds but this file
 * has not caught up with. That combination should not happen — the enum
 * and this list move together — but a public booking page is the last
 * place to throw over an unknown label.
 */
export function meetingType(
  value: SchedulingMeetingType | string,
): MeetingTypeDefinition {
  return isSchedulingMeetingType(value)
    ? DEFINITIONS[value]
    : DEFINITIONS.discovery;
}

/** Console dropdown order — every type, public or not. */
export const MEETING_TYPE_LIST: readonly MeetingTypeDefinition[] =
  SCHEDULING_MEETING_TYPES.map((v) => DEFINITIONS[v]);

/**
 * The offers a stranger may book, in the order /book lists them.
 *
 * The chooser leads with these rather than with people: a prospect knows
 * what they want before they know who they want it from, and the same
 * two offers are available from either Business Builder.
 */
export const PUBLIC_MEETING_TYPES: readonly MeetingTypeDefinition[] =
  MEETING_TYPE_LIST.filter((d) => d.publicOrder !== null).sort(
    (a, b) => (a.publicOrder ?? 0) - (b.publicOrder ?? 0),
  );

export const PUBLIC_MEETING_TYPE_VALUES: readonly SchedulingMeetingType[] =
  PUBLIC_MEETING_TYPES.map((d) => d.value);

/** Whether a booking of this type creates or claims a pipeline lead. */
export function createsProspect(value: SchedulingMeetingType | string): boolean {
  return meetingType(value).createsProspect;
}

/** The pre-work for this type, or null when it asks for none. */
export function prepFor(
  value: SchedulingMeetingType | string,
): PrepRequirement | null {
  return meetingType(value).prep;
}

/**
 * The pre-work as plain lines, for the text half of an email and any
 * other surface without markup. Kept here so the wording cannot drift
 * between the HTML and text bodies.
 */
export function prepAsLines(prep: PrepRequirement): string[] {
  return [
    prep.headline.toUpperCase(),
    prep.why,
    "",
    ...prep.items.map((i) => `- ${i}`),
    "",
    prep.timing,
  ];
}
