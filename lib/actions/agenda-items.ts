"use server";

/**
 * Agenda items — talking points on a session.
 *
 *   - `createAgendaItem`     — add a point to a session's agenda.
 *   - `updateAgendaItem`     — edit title / body.
 *   - `setAgendaItemStatus`  — pending → discussed / deferred.
 *   - `reorderAgendaItems`   — persist a drag-reorder.
 *   - `deleteAgendaItem`     — remove. Linked action items survive
 *                              (FK is SET NULL) — the commitment
 *                              outlives the talking point.
 *   - `carryForwardAgenda`   — copy everything still pending onto the
 *                              next scheduled session.
 *
 * Generic by design: these work on any `bbs_session`, so client BBS
 * sessions get agendas from the same code as the internal team
 * touch-base.
 *
 * Authorization: leadership roles write, everyone in the engagement
 * reads. Anyone who can see a session can raise a point on it — an
 * agenda that only one person can add to isn't an agenda.
 */

import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { clientWriteBlocked, READ_ONLY_ERROR } from "@/lib/server/engagement-guard";
import {
  agendaItems,
  bbsSessions,
  engagements,
  notifications,
  userProfiles,
  type UserProfile,
} from "@/lib/db/schema";
import {
  resolveEngagementIdFromRecord,
  withEngagementContext,
  withSystemContext,
  withTenantContext,
} from "@/lib/db/tenant";
import { resolveEngagementBuilders } from "@/lib/db/queries/engagement-builders";
import { listSessionAgenda } from "@/lib/db/queries/agenda-items";
import { notifyAgendaFinalized } from "@/lib/notifications/agenda-finalized";
import { sendEmailQuietly } from "@/lib/email/send";
import { agendaItemRaisedEmail } from "@/lib/email/templates";
import { sendPushToUser } from "@/lib/push/web-push";
// Plain module, no "use client" — the same Mountain-Time formatter the
// session pages use, so the email and the screen never disagree about
// when a meeting is.
import { formatSessionTime } from "@/components/sessions/utils";

type Role = UserProfile["role"];

/** Roles that may not contribute to an agenda at all. */
const READ_ONLY_ROLES: ReadonlyArray<Role> = ["prospect"];

/**
 * Adding and editing a talking point is open to everyone in the
 * engagement — an agenda only one person can add to isn't an agenda.
 */
function canContribute(role: Role): boolean {
  return !(READ_ONLY_ROLES as readonly string[]).includes(role);
}

/**
 * Destructive and agenda-wide operations — delete, reorder, and
 * carry-forward — are leadership-only. These aren't contributions:
 * deleting removes a point someone else raised, reordering rewrites
 * everyone's agenda, and carry-forward mutates a DIFFERENT session and
 * flips the source items to deferred. Since agendas are generic across
 * client BBS sessions, leaving these open would let a client_employee
 * delete the coach's talking points.
 */
const LEADERSHIP_ROLES: ReadonlyArray<Role> = [
  "master_admin",
  "coach",
  "client_lead",
  "client_manager",
];

function canManageAgenda(role: Role): boolean {
  return (LEADERSHIP_ROLES as readonly string[]).includes(role);
}

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const agendaStatusEnum = z.enum(["pending", "discussed", "deferred"]);

function revalidateAgendaPaths(sessionId: string) {
  revalidatePath("/business-builder/team");
  revalidatePath(`/business-builder/team/${sessionId}`);
  revalidatePath("/portal/sessions");
  revalidatePath(`/portal/sessions/${sessionId}`);
  // The Business Builder's view of a CLIENT session. Its route carries
  // the engagement id as well, which we don't have here, so the layout
  // segment is revalidated rather than the exact path — otherwise a
  // point a client just raised would sit behind a stale render on the
  // one page the coach opens to prepare.
  revalidatePath("/business-builder/sessions/[engagementId]/[sessionId]", "page");
}

/**
 * Shared preamble: authenticate, check the role may contribute, resolve
 * the session's engagement, and confirm the engagement isn't read-only.
 */
async function authorizeForSession(
  sessionId: string,
  opts: { requireManage?: boolean } = {},
): Promise<
  | { ok: true; profile: Extract<Awaited<ReturnType<typeof ensureUserProfile>>, { status: "ok" }>; engagementId: string }
  | { ok: false; error: string }
> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  if (!canContribute(profile.role)) {
    return { ok: false, error: "Your role can't change this agenda." };
  }
  if (opts.requireManage && !canManageAgenda(profile.role)) {
    return { ok: false, error: "Your role can't reorganize this agenda." };
  }
  const engagementId = await resolveEngagementIdFromRecord(
    "bbs_sessions",
    sessionId,
  );
  if (!engagementId) return { ok: false, error: "Meeting not found." };
  if (await clientWriteBlocked(profile.role, engagementId)) {
    return { ok: false, error: READ_ONLY_ERROR };
  }
  return { ok: true, profile, engagementId };
}

/* ------------------------------- create ------------------------------- */

const createSchema = z.object({
  bbsSessionId: z.string().uuid(),
  title: z.string().min(1, "What's the talking point?").max(500),
  body: z.string().max(20000).nullable().optional(),
});

export type CreateAgendaItemInput = z.input<typeof createSchema>;

export async function createAgendaItem(
  input: CreateAgendaItemInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the form and try again.",
    };
  }
  const data = parsed.data;

  const auth = await authorizeForSession(data.bbsSessionId);
  if (!auth.ok) return auth;

  try {
    const id = await withEngagementContext(
      auth.profile.orgId,
      auth.profile.role,
      auth.engagementId,
      async (tx, boundOrgId) => {
        // Append to the end. Computed in-transaction so two people
        // adding at once can't collide on a position.
        const [{ next }] = await tx
          .select({
            next: sql<number>`coalesce(max(${agendaItems.sortOrder}), -1) + 1`,
          })
          .from(agendaItems)
          .where(eq(agendaItems.bbsSessionId, data.bbsSessionId));

        const [row] = await tx
          .insert(agendaItems)
          .values({
            orgId: boundOrgId,
            bbsSessionId: data.bbsSessionId,
            title: data.title,
            body: data.body ?? null,
            sortOrder: next,
            raisedByUserProfileId: auth.profile.userProfileId,
          })
          .returning({ id: agendaItems.id });
        return row.id;
      },
    );

    // A client raising a point is the whole reason this reaches anybody.
    // Fired AFTER the write commits and never allowed to fail the write:
    // a point that is on the agenda but did not send an email is a small
    // problem; a point the client thinks they raised and isn't there is
    // a large one.
    if (isClientRole(auth.profile.role)) {
      await notifyBuildersOfClientAgendaItem({
        engagementId: auth.engagementId,
        sessionId: data.bbsSessionId,
        raiserName: auth.profile.fullName,
        title: data.title,
        body: data.body ?? null,
      });
    }

    revalidateAgendaPaths(data.bbsSessionId);
    return { ok: true, data: { id } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't add the agenda item.",
    };
  }
}

/** Roles that sit on the client side of an engagement. */
const CLIENT_ROLES: ReadonlyArray<Role> = [
  "client_lead",
  "client_manager",
  "client_employee",
];

function isClientRole(role: Role): boolean {
  return (CLIENT_ROLES as readonly string[]).includes(role);
}

/**
 * Tell the engagement's Business Builder that their client wants to
 * cover something.
 *
 * Runs under `withSystemContext`, not the engagement binding the write
 * used, for one reason: Business Builders live in the MASTER org. A
 * notification row written with the client's `org_id` would be invisible
 * to the bell, which reads under the signed-in user's own tenant — the
 * row would exist and reach nobody, which is the worst of both.
 *
 * Best-effort throughout. Every failure logs and returns; none of it can
 * unwind the agenda item, which is already saved and already visible.
 */
async function notifyBuildersOfClientAgendaItem(args: {
  engagementId: string;
  sessionId: string;
  raiserName: string;
  title: string;
  body: string | null;
}): Promise<void> {
  try {
    const ctx = await withSystemContext(async (tx) => {
      const builders = await resolveEngagementBuilders(tx, args.engagementId);
      if (builders.length === 0) return null;

      const [session] = await tx
        .select({ scheduledAt: bbsSessions.scheduledAt })
        .from(bbsSessions)
        .where(eq(bbsSessions.id, args.sessionId))
        .limit(1);

      const [eng] = await tx
        .select({ name: engagements.name })
        .from(engagements)
        .where(eq(engagements.id, args.engagementId))
        .limit(1);

      await tx.insert(notifications).values(
        builders.map((b) => ({
          // The Builder's OWN org — see the note above.
          orgId: b.orgId,
          userProfileId: b.userProfileId,
          type: "agenda_item_raised" as const,
          // Points at the SESSION, not the agenda item: the feed's job is
          // to get you to the agenda, and an agenda item has no page of
          // its own.
          parentEntityType: "agenda_item_raised",
          parentEntityId: args.sessionId,
          sentVia: "both" as const,
        })),
      );

      return {
        builders,
        scheduledAt: session?.scheduledAt ?? null,
        engagementLabel: eng?.name?.trim() || "Your client",
      };
    });
    if (!ctx) return;

    const whenLabel = ctx.scheduledAt
      ? formatSessionTime(ctx.scheduledAt)
      : "an upcoming session";
    const url = `/business-builder/sessions/${args.engagementId}/${args.sessionId}`;

    await Promise.all(
      ctx.builders.map((b) =>
        sendEmailQuietly(
          agendaItemRaisedEmail({
            to: b.email,
            recipientName: b.fullName,
            raiserName: args.raiserName,
            engagementLabel: ctx.engagementLabel,
            itemTitle: args.title,
            itemBody: args.body,
            sessionWhenLabel: whenLabel,
            url,
          }),
        ),
      ),
    );

    await Promise.all(
      ctx.builders.map((b) =>
        sendPushToUser(b.userProfileId, {
          title: `${ctx.engagementLabel} added to the agenda`,
          body: args.title,
          url,
          tag: `agenda-${args.sessionId}`,
        }),
      ),
    );
  } catch (e) {
    console.error("[agenda-items] client-raised notification failed", e);
  }
}

/* ------------------------------- update ------------------------------- */

const updateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  body: z.string().max(20000).nullable().optional(),
});

export type UpdateAgendaItemInput = z.input<typeof updateSchema>;

export async function updateAgendaItem(
  agendaItemId: string,
  input: UpdateAgendaItemInput,
): Promise<ActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the form and try again.",
    };
  }

  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  if (!canContribute(profile.role)) {
    return { ok: false, error: "Your role can't change this agenda." };
  }
  const engagementId = await resolveEngagementIdFromRecord(
    "agenda_items",
    agendaItemId,
  );
  if (!engagementId) return { ok: false, error: "Agenda item not found." };
  if (await clientWriteBlocked(profile.role, engagementId)) {
    return { ok: false, error: READ_ONLY_ERROR };
  }

  const patch: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.body !== undefined) patch.body = parsed.data.body;
  if (Object.keys(patch).length === 0) return { ok: true, data: undefined };

  try {
    const sessionId = await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        const [row] = await tx
          .update(agendaItems)
          .set(patch)
          .where(eq(agendaItems.id, agendaItemId))
          .returning({ sessionId: agendaItems.bbsSessionId });
        return row?.sessionId ?? null;
      },
    );
    if (sessionId) revalidateAgendaPaths(sessionId);
    return { ok: true, data: undefined };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't save the change.",
    };
  }
}

/* ------------------------------- status ------------------------------- */

export async function setAgendaItemStatus(
  agendaItemId: string,
  status: z.infer<typeof agendaStatusEnum>,
): Promise<ActionResult> {
  const parsed = agendaStatusEnum.safeParse(status);
  if (!parsed.success) return { ok: false, error: "Unknown status." };

  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  if (!canContribute(profile.role)) {
    return { ok: false, error: "Your role can't change this agenda." };
  }
  const engagementId = await resolveEngagementIdFromRecord(
    "agenda_items",
    agendaItemId,
  );
  if (!engagementId) return { ok: false, error: "Agenda item not found." };
  if (await clientWriteBlocked(profile.role, engagementId)) {
    return { ok: false, error: READ_ONLY_ERROR };
  }

  try {
    const sessionId = await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        const [row] = await tx
          .update(agendaItems)
          .set({ status: parsed.data })
          .where(eq(agendaItems.id, agendaItemId))
          .returning({ sessionId: agendaItems.bbsSessionId });
        return row?.sessionId ?? null;
      },
    );
    if (sessionId) revalidateAgendaPaths(sessionId);
    return { ok: true, data: undefined };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't update the status.",
    };
  }
}

/* ------------------------------ reorder ------------------------------- */

const reorderSchema = z.object({
  bbsSessionId: z.string().uuid(),
  /** Agenda item ids in their new top-to-bottom order. */
  orderedIds: z.array(z.string().uuid()).min(1).max(200),
});

export type ReorderAgendaInput = z.input<typeof reorderSchema>;

export async function reorderAgendaItems(
  input: ReorderAgendaInput,
): Promise<ActionResult> {
  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Bad order." };
  }
  const data = parsed.data;

  const auth = await authorizeForSession(data.bbsSessionId, {
    requireManage: true,
  });
  if (!auth.ok) return auth;

  try {
    await withEngagementContext(
      auth.profile.orgId,
      auth.profile.role,
      auth.engagementId,
      async (tx) => {
        // Scope every write to the session as well as the id, so a
        // tampered client can't reorder items on someone else's agenda
        // by smuggling foreign ids into the list.
        for (let i = 0; i < data.orderedIds.length; i += 1) {
          await tx
            .update(agendaItems)
            .set({ sortOrder: i })
            .where(
              and(
                eq(agendaItems.id, data.orderedIds[i]),
                eq(agendaItems.bbsSessionId, data.bbsSessionId),
              ),
            );
        }
      },
    );
    revalidateAgendaPaths(data.bbsSessionId);
    return { ok: true, data: undefined };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't save the new order.",
    };
  }
}

/* ------------------------------- delete ------------------------------- */

export async function deleteAgendaItem(
  agendaItemId: string,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  if (!canContribute(profile.role)) {
    return { ok: false, error: "Your role can't change this agenda." };
  }
  const engagementId = await resolveEngagementIdFromRecord(
    "agenda_items",
    agendaItemId,
  );
  if (!engagementId) return { ok: false, error: "Agenda item not found." };
  if (await clientWriteBlocked(profile.role, engagementId)) {
    return { ok: false, error: READ_ONLY_ERROR };
  }

  try {
    const result = await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        // Author-or-leadership. Everyone may raise a point, so everyone
        // may retract their own; removing a point SOMEONE ELSE raised
        // is a moderation act. Checked in the bound transaction so the
        // read is RLS-scoped.
        const [existing] = await tx
          .select({
            sessionId: agendaItems.bbsSessionId,
            raisedBy: agendaItems.raisedByUserProfileId,
          })
          .from(agendaItems)
          .where(eq(agendaItems.id, agendaItemId))
          .limit(1);
        if (!existing) return { sessionId: null, denied: false };

        const isAuthor = existing.raisedBy === profile.userProfileId;
        if (!isAuthor && !canManageAgenda(profile.role)) {
          return { sessionId: existing.sessionId, denied: true };
        }

        await tx.delete(agendaItems).where(eq(agendaItems.id, agendaItemId));
        return { sessionId: existing.sessionId, denied: false };
      },
    );
    if (result.denied) {
      return {
        ok: false,
        error: "Only the person who raised this point can remove it.",
      };
    }
    if (result.sessionId) revalidateAgendaPaths(result.sessionId);
    return { ok: true, data: undefined };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't delete the item.",
    };
  }
}

/* --------------------------- carry forward ---------------------------- */

/**
 * Copy everything still `pending` onto the next scheduled session.
 *
 * This is the mechanic that stops a recurring touch-base from losing
 * its own thread. Each copy points back via
 * `carried_from_agenda_item_id`, so "we've punted this three weeks
 * running" stays visible instead of looking like a fresh item.
 *
 * The source items are marked `deferred` rather than left pending, so
 * running this twice can't duplicate them.
 */
export async function carryForwardAgenda(
  fromSessionId: string,
): Promise<ActionResult<{ carried: number; toSessionId: string | null }>> {
  const auth = await authorizeForSession(fromSessionId, {
    requireManage: true,
  });
  if (!auth.ok) return auth;

  try {
    const result = await withEngagementContext(
      auth.profile.orgId,
      auth.profile.role,
      auth.engagementId,
      async (tx, boundOrgId) => {
        const [source] = await tx
          .select({ scheduledAt: bbsSessions.scheduledAt })
          .from(bbsSessions)
          .where(eq(bbsSessions.id, fromSessionId))
          .limit(1);
        if (!source) return { carried: 0, toSessionId: null };

        const [target] = await tx
          .select({ id: bbsSessions.id })
          .from(bbsSessions)
          .where(
            and(
              eq(bbsSessions.engagementId, auth.engagementId),
              eq(bbsSessions.status, "scheduled"),
              gt(bbsSessions.scheduledAt, source.scheduledAt),
            ),
          )
          .orderBy(asc(bbsSessions.scheduledAt))
          .limit(1);
        if (!target) return { carried: 0, toSessionId: null };

        const pending = await tx
          .select()
          .from(agendaItems)
          .where(
            and(
              eq(agendaItems.bbsSessionId, fromSessionId),
              eq(agendaItems.status, "pending"),
            ),
          )
          .orderBy(asc(agendaItems.sortOrder));
        if (pending.length === 0) {
          return { carried: 0, toSessionId: target.id };
        }

        const [{ next }] = await tx
          .select({
            next: sql<number>`coalesce(max(${agendaItems.sortOrder}), -1) + 1`,
          })
          .from(agendaItems)
          .where(eq(agendaItems.bbsSessionId, target.id));

        await tx.insert(agendaItems).values(
          pending.map((item, i) => ({
            orgId: boundOrgId,
            bbsSessionId: target.id,
            title: item.title,
            body: item.body,
            sortOrder: next + i,
            raisedByUserProfileId: item.raisedByUserProfileId,
            carriedFromAgendaItemId: item.id,
          })),
        );

        await tx
          .update(agendaItems)
          .set({ status: "deferred" })
          .where(
            inArray(
              agendaItems.id,
              pending.map((p) => p.id),
            ),
          );

        return { carried: pending.length, toSessionId: target.id };
      },
    );
    revalidateAgendaPaths(fromSessionId);
    if (result.toSessionId) revalidateAgendaPaths(result.toSessionId);
    return { ok: true, data: result };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't carry items forward.",
    };
  }
}

/* ------------------------------ finalize ------------------------------ */

/**
 * Declaring an agenda ready, and announcing it.
 *
 * Business Builders only — deliberately narrower than `canManageAgenda`,
 * which includes `client_lead` and `client_manager`. The emails this
 * sends go to Bruce and Jen, so a client pressing it would be firing our
 * internal prep signal; and the control does not render on the client
 * portal at all. Finalizing is our declaration that the agenda is ready
 * to prepare from, not a client's.
 *
 * First press announces the agenda and invites additions. Every press
 * after that announces only what has changed since the previous one —
 * `bbs_sessions.agenda_finalized_at` is both the state and the watermark
 * the delta is measured from.
 */
const BUILDER_ROLES: ReadonlyArray<Role> = ["master_admin", "coach"];

export type FinalizeAgendaResult = {
  /** How many people were emailed. Zero is legitimate — a solo Builder
   *  finalizing their own agenda has nobody else to tell. */
  notified: number;
  isUpdate: boolean;
};

export async function finalizeAgenda(
  sessionId: string,
): Promise<ActionResult<FinalizeAgendaResult>> {
  try {
    const profile = await ensureUserProfile();
    if (profile.status !== "ok") {
      return { ok: false, error: "Not authenticated." };
    }
    if (!(BUILDER_ROLES as readonly string[]).includes(profile.role)) {
      return { ok: false, error: "Only a Business Builder can finalize an agenda." };
    }
    const engagementId = await resolveEngagementIdFromRecord(
      "bbs_sessions",
      sessionId,
    );
    if (!engagementId) return { ok: false, error: "Meeting not found." };
    if (await clientWriteBlocked(profile.role, engagementId)) {
      return { ok: false, error: READ_ONLY_ERROR };
    }

    // Stamped BEFORE the agenda is read, so anything added during the
    // read-then-write window falls after the watermark and is caught by
    // the next announcement rather than vanishing between the two.
    const finalizedAt = new Date();

    const session = await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        const [row] = await tx
          .select({
            id: bbsSessions.id,
            scheduledAt: bbsSessions.scheduledAt,
            status: bbsSessions.status,
            previousFinalizedAt: bbsSessions.agendaFinalizedAt,
          })
          .from(bbsSessions)
          .where(eq(bbsSessions.id, sessionId))
          .limit(1);
        return row ?? null;
      },
    );
    if (!session) return { ok: false, error: "Meeting not found." };
    if (session.status === "cancelled") {
      return { ok: false, error: "This session was cancelled." };
    }
    if (session.scheduledAt.getTime() <= Date.now()) {
      return {
        ok: false,
        error: "This session has already started — its agenda is a record now.",
      };
    }

    // Read through the normal query so raiser names resolve the same way
    // they do on screen. It does its own cross-org name pass, which a
    // read inside the engagement-bound transaction above cannot do.
    const items = await listSessionAgenda(sessionId);
    if (items.length === 0) {
      return {
        ok: false,
        error: "There is nothing on this agenda yet — add a point first.",
      };
    }

    const prev = session.previousFinalizedAt;
    const isUpdate = prev !== null;
    const added = prev ? items.filter((i) => i.createdAt > prev) : [];
    const changed = prev
      ? items.filter((i) => i.createdAt <= prev && i.updatedAt > prev)
      : [];

    // A second press that announces nothing is almost always a double
    // click, and it would send an "updated" email describing no update.
    if (isUpdate && added.length === 0 && changed.length === 0) {
      return {
        ok: false,
        error: "Nothing has changed since you last finalized this agenda.",
      };
    }

    await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        await tx
          .update(bbsSessions)
          .set({
            agendaFinalizedAt: finalizedAt,
            agendaFinalizedByUserProfileId: profile.userProfileId,
            updatedAt: new Date(),
          })
          .where(eq(bbsSessions.id, sessionId));
      },
    );

    const toLine = (i: (typeof items)[number]) => ({
      title: i.title,
      body: i.body,
      raisedByName: i.raisedByName,
    });

    const notified = await notifyAgendaFinalized({
      sessionId,
      engagementId,
      actorUserProfileId: profile.userProfileId,
      actorName: await loadActorName(profile.orgId, profile.userProfileId),
      sessionWhenLabel: formatSessionTime(session.scheduledAt),
      items: items.map(toLine),
      added: added.map(toLine),
      changed: changed.map(toLine),
      isUpdate,
    });

    revalidateAgendaPaths(sessionId);
    return { ok: true, data: { notified, isUpdate } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't finalize the agenda.",
    };
  }
}

/** The finalizer's own name, read under their own tenant. */
async function loadActorName(
  orgId: string,
  userProfileId: string,
): Promise<string> {
  try {
    const name = await withTenantContext(orgId, async (tx) => {
      const [row] = await tx
        .select({ fullName: userProfiles.fullName })
        .from(userProfiles)
        .where(eq(userProfiles.id, userProfileId))
        .limit(1);
      return row?.fullName ?? null;
    });
    return name ?? "Someone";
  } catch {
    return "Someone";
  }
}
