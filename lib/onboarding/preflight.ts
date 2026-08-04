/**
 * What must be true before onboarding can start.
 *
 * **Why this refuses rather than warns.** The sequence sends three things
 * to a real client. Once the onboarding email has gone, it cannot be
 * recalled; nor can the payment form, nor the portal invitation. So a
 * run that gets halfway and stops is strictly worse than one that never
 * started — the client has been welcomed to a workspace that isn't ready,
 * or asked for their banking details against a fee nobody set. Every
 * condition below is something that, if missing, makes one of those three
 * sends wrong rather than merely incomplete.
 *
 * There is deliberately no override. Bruce's call, and the right one: if
 * a check is failing, the record is wrong, and the record is what the
 * client is about to be shown.
 *
 * Each blocker carries the sentence that says what to do and a link to
 * the place that does it — a refusal that only says "not ready" makes the
 * operator hunt for which of four things it meant.
 */

import { and, eq, gte, ne } from "drizzle-orm";
import {
  bbsSessions,
  engagements,
  portalModuleAssignments,
  prospects,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

export type OnboardingBlocker = {
  /** Stable key, so the UI can anchor to a specific control. */
  key: "monthly_fee" | "first_session" | "contact_email" | "portal_modules";
  /** What is missing, in one sentence a non-developer can act on. */
  message: string;
  /** Where to go and fix it. */
  href: string;
  linkLabel: string;
};

export type OnboardingReadiness = {
  ready: boolean;
  blockers: OnboardingBlocker[];
  /** Resolved once, and reused by the sequence so it cannot disagree. */
  clientName: string | null;
  clientEmail: string | null;
  prospectId: string | null;
};

export async function checkOnboardingReadiness(
  engagementId: string,
): Promise<OnboardingReadiness> {
  return withSystemContext(async (tx) => {
    const blockers: OnboardingBlocker[] = [];

    const [eng] = await tx
      .select({
        id: engagements.id,
        name: engagements.name,
        monthlyFeeCents: engagements.monthlyFeeCents,
      })
      .from(engagements)
      .where(eq(engagements.id, engagementId))
      .limit(1);

    if (!eng) {
      return {
        ready: false,
        blockers: [
          {
            key: "contact_email",
            message: "This client record could not be found.",
            href: "/business-builder/engagements",
            linkLabel: "Back to clients",
          },
        ],
        clientName: null,
        clientEmail: null,
        prospectId: null,
      };
    }

    // 1. Monthly fee. The PAD form asks the client to authorize a debit;
    //    without a fee it would ask them to authorize an unstated amount.
    //    Treated as missing when zero as well as null — a fee of nothing
    //    is not a fee that was set, it is one that was never filled in.
    if (!eng.monthlyFeeCents || Number(eng.monthlyFeeCents) <= 0) {
      blockers.push({
        key: "monthly_fee",
        message:
          "No monthly fee is set. The payment form authorizes a debit, so it needs the amount first — the field is just above.",
        // Anchors to the fee field inside this very panel. It used to
        // point at the client page, where no fee control was mounted at
        // all: the blocker named a fix the operator could not perform,
        // which is how "I don't know where to set this" happens.
        href: `/business-builder/engagements/${engagementId}#onboarding-setup`,
        linkLabel: "Set it above",
      });
    }

    // 2. A first session on the books. The onboarding email tells the
    //    client when they are starting, and the assessment deadline is
    //    derived from it — with no session the email either omits the
    //    date or invents one.
    const [session] = await tx
      .select({ id: bbsSessions.id })
      .from(bbsSessions)
      .where(
        and(
          eq(bbsSessions.engagementId, engagementId),
          gte(bbsSessions.scheduledAt, new Date()),
          ne(bbsSessions.status, "cancelled"),
        ),
      )
      .limit(1);
    if (!session) {
      blockers.push({
        key: "first_session",
        message:
          "No first session is scheduled. The onboarding email tells the client when they start, and the assessment deadline is worked back from that date.",
        // Linking or creating a recurring schedule in the panel above
        // materializes the upcoming sessions, which clears this — so
        // point at that rather than at the one-off scheduling page. It
        // is the same journey for a client who meets fortnightly, and
        // one fewer place to visit.
        href: `/business-builder/engagements/${engagementId}#onboarding-setup`,
        linkLabel: "Set the schedule above",
      });
    }

    // 3. Somewhere to send it. Every one of the three steps emails this
    //    address.
    const [prospect] = await tx
      .select({
        id: prospects.id,
        contactName: prospects.contactName,
        contactEmail: prospects.contactEmail,
      })
      .from(prospects)
      .where(eq(prospects.convertedEngagementId, engagementId))
      .limit(1);

    const clientEmail = prospect?.contactEmail?.trim() || null;
    if (!clientEmail) {
      blockers.push({
        key: "contact_email",
        message:
          "This client has no contact email. All three steps email them, so nothing can be sent.",
        href: prospect
          ? `/business-builder/pipeline/${prospect.id}`
          : `/business-builder/engagements/${engagementId}`,
        linkLabel: "Add a contact email",
      });
    }

    // 4. Portal modules deliberately chosen.
    //
    //    This is the check that stops the invitation landing on an
    //    unconsidered workspace. Every module is enabled by default until
    //    a row exists in portal_module_assignments, so "no rows" means
    //    nobody has looked — not that everything was intended. The portal
    //    invite is the step that drops the client into that workspace,
    //    which is exactly why this is a button and not something that
    //    fires automatically on signature.
    const [assignment] = await tx
      .select({ engagementId: portalModuleAssignments.engagementId })
      .from(portalModuleAssignments)
      .where(eq(portalModuleAssignments.engagementId, engagementId))
      .limit(1);
    if (!assignment) {
      blockers.push({
        key: "portal_modules",
        message:
          "The portal modules haven't been reviewed. Everything is on by default — open the client portal panel and confirm what this client should see.",
        href: `/business-builder/engagements/${engagementId}`,
        linkLabel: "Review portal modules",
      });
    }

    return {
      ready: blockers.length === 0,
      blockers,
      clientName: prospect?.contactName ?? eng.name ?? null,
      clientEmail,
      prospectId: prospect?.id ?? null,
    };
  });
}
