/**
 * What we ask Google for, what each feature actually needs, and how to
 * tell which of those is missing from a grant.
 *
 * One definition, because there were three implicit ones: the scope
 * string sent at consent, an unwritten assumption in each caller about
 * what its endpoint requires, and whatever Google happened to return.
 * Nothing compared them, so a grant could satisfy the request exactly
 * and still not authorize the calls the app makes — which is not a state
 * anything in the app could previously describe.
 *
 * The distinction that matters when something 403s:
 *
 *   - granted ⊉ required, and the missing scope IS in our request
 *       → the user withheld it on the consent screen. Reconnecting and
 *         ticking everything fixes it.
 *   - granted ⊉ required, and the missing scope is NOT in our request
 *       → WE never asked. Reconnecting changes nothing at all; the
 *         request string has to be fixed and deployed first.
 *
 * Telling a person to reconnect in the second case sends them round a
 * loop that cannot succeed, which is why this module exists rather than
 * a comment.
 */

/** Scopes are compared by exact URL; `openid`/`email` need normalising. */
const ALIASES: Record<string, string> = {
  email: "https://www.googleapis.com/auth/userinfo.email",
  profile: "https://www.googleapis.com/auth/userinfo.profile",
};

export function normalizeScopes(scope: string | null | undefined): string[] {
  if (!scope) return [];
  return scope
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((s) => ALIASES[s] ?? s);
}

/**
 * A capability the app relies on, the Google endpoint behind it, and
 * every scope that would authorize it. Listing ALTERNATIVES matters:
 * `calendar` is a superset of `calendar.events`, so a grant carrying the
 * broader one is not missing anything and must not be reported as such.
 */
export type GoogleCapability = {
  key: string;
  /** What breaks for a human if this is missing. */
  label: string;
  /** The REST method, so a diagnosis names the call rather than a guess. */
  endpoint: string;
  /** Any ONE of these authorizes it. */
  anyOf: string[];
  /** False for things we probe but do not depend on. */
  required: boolean;
};

const S = "https://www.googleapis.com/auth/";

export const GOOGLE_CAPABILITIES: GoogleCapability[] = [
  {
    key: "calendar.events.read",
    label: "Read calendar events (booking availability, EA free time)",
    endpoint: "calendar.events.list",
    anyOf: [`${S}calendar.events`, `${S}calendar.events.readonly`, `${S}calendar`, `${S}calendar.readonly`],
    required: true,
  },
  {
    key: "calendar.events.write",
    label: "Create and update calendar events",
    endpoint: "calendar.events.insert",
    anyOf: [`${S}calendar.events`, `${S}calendar`],
    required: true,
  },
  {
    key: "gmail.read",
    label: "Read inbox (EA triage)",
    endpoint: "gmail.users.messages.list",
    anyOf: [`${S}gmail.readonly`, `${S}gmail.modify`],
    required: true,
  },
  {
    key: "gmail.draft",
    label: "Create drafts (EA replies)",
    endpoint: "gmail.users.drafts.create",
    anyOf: [`${S}gmail.compose`, `${S}gmail.modify`],
    required: true,
  },
  {
    key: "gmail.send",
    label: "Send mail as the Builder (session recaps)",
    endpoint: "gmail.users.messages.send",
    anyOf: [`${S}gmail.send`, `${S}gmail.compose`],
    required: true,
  },
  {
    key: "drive.read",
    label: "Read linked Drive folders",
    endpoint: "drive.files.list",
    anyOf: [`${S}drive.readonly`, `${S}drive`],
    required: true,
  },
  {
    key: "drive.write",
    label: "Write to app-created Drive folders",
    endpoint: "drive.files.create",
    anyOf: [`${S}drive.file`, `${S}drive`],
    required: true,
  },
  {
    /**
     * NOT required, and listed precisely so it is never mistaken for the
     * fault. `calendar.events` does not authorize calendarList or
     * freebusy — they need `calendar.readonly` or `calendar`. The app
     * calls neither; every calendar read it makes is events.list against
     * a known calendar id. A probe that hit calendarList would therefore
     * 403 on a perfectly healthy connection, which is exactly the false
     * trail this entry exists to prevent anyone following again.
     */
    key: "calendar.list",
    label: "Enumerate the account's calendars (not used by this app)",
    endpoint: "calendar.calendarList.list",
    anyOf: [`${S}calendar.readonly`, `${S}calendar`],
    required: false,
  },
];

export type CapabilityStatus = GoogleCapability & { granted: boolean };

export function assessCapabilities(
  grantedScope: string | null | undefined,
): CapabilityStatus[] {
  const granted = new Set(normalizeScopes(grantedScope));
  return GOOGLE_CAPABILITIES.map((c) => ({
    ...c,
    granted: c.anyOf.some((s) => granted.has(s)),
  }));
}

/** Required capabilities this grant does not cover. */
export function missingRequired(
  grantedScope: string | null | undefined,
): CapabilityStatus[] {
  return assessCapabilities(grantedScope).filter((c) => c.required && !c.granted);
}

/**
 * Would reconnecting help? Only if the scope we are missing is one we
 * actually ask for. If it is absent from the request string, consent
 * cannot grant it however many times the user clicks through.
 */
export function isRecoverableByReconnect(
  missing: CapabilityStatus[],
  requestedScope: string,
): boolean {
  if (missing.length === 0) return false;
  const requested = new Set(normalizeScopes(requestedScope));
  return missing.every((c) => c.anyOf.some((s) => requested.has(s)));
}
