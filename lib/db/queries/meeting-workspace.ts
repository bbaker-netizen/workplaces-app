/**
 * Everything one meeting's workspace needs, in one hop.
 *
 * The point of the workspace is that a session has ONE page: the recap,
 * the transcript, and every commitment and document that came out of it,
 * with somewhere to add what the transcript missed. Before this, those
 * lived across the Meetings library, the Action items module, the
 * Deliverables module and the BBS session page, which is the redundancy
 * Bruce asked to be rid of.
 */

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  actionItems,
  bbsSessions,
  engagementMeetings,
  engagements,
  sessionRecaps,
  userProfiles,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import type { DeliverableType } from "@/lib/deliverables/types";

export type FollowThroughItem = {
  id: string;
  title: string;
  description: string | null;
  status: "draft" | "open" | "in_progress" | "done" | "blocked";
  assigneeUserProfileId: string | null;
  assigneeName: string | null;
  dueDate: Date | null;
  deliverableType: DeliverableType | null;
  revenueImpact: boolean;
  marginImpact: boolean;
  createdBy: "coach" | "claude";
  confidenceFlag: "high" | "medium" | "low" | null;
};

/**
 * The client-facing recap drafted from this session, if there is one.
 *
 * Until this shipped, `session_recaps` was rendered nowhere in the app —
 * the only way to act on a drafted recap was the approve link in the
 * emailed copy, which sends it verbatim. There was no way to change a
 * word before it reached a client.
 */
export type WorkspaceRecap = {
  id: string;
  status: "draft" | "approved" | "sent";
  subject: string;
  /** What the editor edits. Markdown is the source of truth for an
   *  edited recap; the HTML and plain-text bodies are derived from it. */
  bodyMarkdown: string;
  approvedAt: Date | null;
  sentAt: Date | null;
  /** How many client contacts a send would actually reach. Counted with
   *  the same rule the send path uses, so the panel cannot promise a
   *  delivery that will not happen. Zero is common — a client nobody has
   *  invited to their portal yet has no user rows at all. */
  recipientCount: number;
};

export type MeetingWorkspace = {
  meeting: typeof engagementMeetings.$inferSelect;
  engagementName: string | null;
  items: FollowThroughItem[];
  /** Everyone who could own something out of this session: the client's
   *  own people AND the Business Builders. Drives the owner dropdown. */
  members: { id: string; name: string | null; role: string }[];
  recap: WorkspaceRecap | null;
};

export async function getMeetingWorkspace(
  meetingId: string,
): Promise<MeetingWorkspace | null> {
  return withSystemContext(async (tx) => {
    const [meeting] = await tx
      .select()
      .from(engagementMeetings)
      .where(eq(engagementMeetings.id, meetingId))
      .limit(1);
    if (!meeting) return null;

    const [eng] = await tx
      .select({ name: engagements.name, orgId: engagements.orgId })
      .from(engagements)
      .where(eq(engagements.id, meeting.engagementId))
      .limit(1);

    const rows = await tx
      .select({
        id: actionItems.id,
        title: actionItems.title,
        description: actionItems.description,
        status: actionItems.status,
        assigneeUserProfileId: actionItems.assigneeUserProfileId,
        assigneeName: userProfiles.fullName,
        dueDate: actionItems.dueDate,
        deliverableType: actionItems.deliverableType,
        revenueImpact: actionItems.revenueImpact,
        marginImpact: actionItems.marginImpact,
        createdBy: actionItems.createdBy,
        confidenceFlag: actionItems.confidenceFlag,
      })
      .from(actionItems)
      .leftJoin(
        userProfiles,
        eq(userProfiles.id, actionItems.assigneeUserProfileId),
      )
      .where(eq(actionItems.engagementMeetingId, meetingId))
      // Drafts first — they are the ones needing a decision, and the
      // whole page exists so they get one. Then newest.
      .orderBy(asc(actionItems.status), desc(actionItems.createdAt));

    // The client's own people, plus every Business Builder. A commitment
    // out of a session is as often ours as theirs, so an owner list of
    // only the client's team would force half of them to be assigned
    // somewhere else.
    const clientPeople = eng
      ? await tx
          .select({
            id: userProfiles.id,
            name: userProfiles.fullName,
            role: userProfiles.role,
          })
          .from(userProfiles)
          .where(eq(userProfiles.orgId, eng.orgId))
      : [];

    const builders = await tx
      .select({
        id: userProfiles.id,
        name: userProfiles.fullName,
        role: userProfiles.role,
      })
      .from(userProfiles)
      .where(eq(userProfiles.role, "coach"));

    const admins = await tx
      .select({
        id: userProfiles.id,
        name: userProfiles.fullName,
        role: userProfiles.role,
      })
      .from(userProfiles)
      .where(eq(userProfiles.role, "master_admin"));

    const seen = new Set<string>();
    const members = [...admins, ...builders, ...clientPeople].filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });

    // The recap for this meeting.
    //
    // `session_recaps` hangs off `bbs_sessions`, not off the meeting, so
    // the join runs through the transcript id the two tables share —
    // the same key the recap sweep used to attach the transcript in the
    // first place. A meeting with no transcript can have no recap, so
    // the lookup is skipped entirely rather than scanning.
    let recap: WorkspaceRecap | null = null;
    if (meeting.firefliesTranscriptId) {
      const [row] = await tx
        .select({
          id: sessionRecaps.id,
          status: sessionRecaps.status,
          subject: sessionRecaps.subject,
          bodyMarkdown: sessionRecaps.bodyMarkdown,
          bodyText: sessionRecaps.bodyText,
          approvedAt: sessionRecaps.approvedAt,
          sentAt: sessionRecaps.sentAt,
        })
        .from(sessionRecaps)
        .innerJoin(bbsSessions, eq(bbsSessions.id, sessionRecaps.bbsSessionId))
        .where(
          and(
            eq(sessionRecaps.engagementId, meeting.engagementId),
            eq(bbsSessions.firefliesRecordingId, meeting.firefliesTranscriptId),
          ),
        )
        .limit(1);

      if (row) {
        const contacts = eng
          ? await tx
              .select({ email: userProfiles.email })
              .from(userProfiles)
              .where(
                and(
                  eq(userProfiles.orgId, eng.orgId),
                  inArray(userProfiles.role, ["client_lead", "client_manager"]),
                ),
              )
          : [];
        recap = {
          id: row.id,
          status: row.status,
          subject: row.subject,
          // Pre-0087 recaps have no markdown column; the plain-text body
          // is the closest thing to edit and reads acceptably as markdown.
          bodyMarkdown: row.bodyMarkdown ?? row.bodyText,
          approvedAt: row.approvedAt,
          sentAt: row.sentAt,
          recipientCount: contacts.filter((c) => c.email?.includes("@")).length,
        };
      }
    }

    return {
      meeting,
      engagementName: eng?.name ?? null,
      items: rows as FollowThroughItem[],
      members,
      recap,
    };
  });
}

/** Pending-review counts for the meetings index, batched. */
export async function countDraftsByMeeting(
  engagementId: string,
): Promise<Map<string, number>> {
  const rows = await withSystemContext(async (tx) =>
    tx
      .select({
        meetingId: actionItems.engagementMeetingId,
        status: actionItems.status,
      })
      .from(actionItems)
      .where(
        and(
          eq(actionItems.engagementId, engagementId),
          eq(actionItems.status, "draft"),
        ),
      ),
  );
  const out = new Map<string, number>();
  for (const r of rows) {
    if (!r.meetingId) continue;
    out.set(r.meetingId, (out.get(r.meetingId) ?? 0) + 1);
  }
  return out;
}
