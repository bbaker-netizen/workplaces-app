"use server";

import { and, eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  cohorts,
  courses,
  enrollments,
  lessonCompletions,
  lessons,
  type UserProfile,
} from "@/lib/db/schema";
import {
  resolveEngagementIdFromRecord,
  withEngagementContext,
} from "@/lib/db/tenant";

type Role = UserProfile["role"];
function canEdit(role: Role): boolean {
  return (
    role === "master_admin" ||
    role === "coach" ||
    role === "client_lead" ||
    role === "client_manager"
  );
}

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const deliveryEnum = z.enum(["self_paced", "cohort"]);
const cohortStatus = z.enum(["upcoming", "in_progress", "completed", "cancelled"]);
type EnrollmentStatus =
  | "enrolled"
  | "in_progress"
  | "completed"
  | "dropped";

/* --------------------------------- course --------------------------------- */

const createCourseSchema = z.object({
  engagementId: z.string().uuid(),
  name: z.string().min(1).max(500),
  description: z.string().max(50000).nullable().optional(),
  deliveryMode: deliveryEnum,
  isPublished: z.boolean().default(false),
});

export async function createCourse(
  input: z.input<typeof createCourseSchema>,
): Promise<ActionResult<{ id: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canEdit(profile.role))
    return { ok: false, error: "Your role can't create courses." };
  const parsed = createCourseSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  const data = parsed.data;
  try {
    const created = await withEngagementContext(
      profile.orgId,
      profile.role,
      data.engagementId,
      async (tx, boundOrgId) => {
        const [row] = await tx
          .insert(courses)
          .values({
            orgId: boundOrgId,
            engagementId: data.engagementId,
            name: data.name,
            description: data.description ?? null,
            deliveryMode: data.deliveryMode,
            isPublished: data.isPublished,
          })
          .returning({ id: courses.id });
        return row;
      },
    );
    revalidatePath("/portal/courses");
    return { ok: true, data: created };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function deleteCourse(id: string): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canEdit(profile.role))
    return { ok: false, error: "Your role can't delete courses." };
  const engagementId = await resolveEngagementIdFromRecord("courses", id);
  if (!engagementId) return { ok: false, error: "Course not found." };
  try {
    await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        await tx.delete(courses).where(eq(courses.id, id));
      },
    );
    revalidatePath("/portal/courses");
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function publishCourse(
  id: string,
  isPublished: boolean,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canEdit(profile.role))
    return { ok: false, error: "Your role can't edit courses." };
  const engagementId = await resolveEngagementIdFromRecord("courses", id);
  if (!engagementId) return { ok: false, error: "Course not found." };
  try {
    await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        await tx
          .update(courses)
          .set({ isPublished })
          .where(eq(courses.id, id));
      },
    );
    revalidatePath("/portal/courses");
    revalidatePath(`/portal/courses/${id}`);
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/* --------------------------------- lesson --------------------------------- */

const createLessonSchema = z.object({
  courseId: z.string().uuid(),
  title: z.string().min(1).max(500),
  body: z.string().max(100000).nullable().optional(),
});

export async function createLesson(
  input: z.input<typeof createLessonSchema>,
): Promise<ActionResult<{ id: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canEdit(profile.role))
    return { ok: false, error: "Your role can't add lessons." };
  const parsed = createLessonSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  const data = parsed.data;
  const engagementId = await resolveEngagementIdFromRecord(
    "courses",
    data.courseId,
  );
  if (!engagementId) return { ok: false, error: "Course not found." };
  try {
    const created = await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx, boundOrgId) => {
        const [{ maxOrder } = { maxOrder: 0 }] = await tx
          .select({ maxOrder: max(lessons.orderIndex) })
          .from(lessons)
          .where(eq(lessons.courseId, data.courseId));
        const [row] = await tx
          .insert(lessons)
          .values({
            orgId: boundOrgId,
            courseId: data.courseId,
            title: data.title,
            body: data.body ?? null,
            orderIndex: (Number(maxOrder) || 0) + 1,
          })
          .returning({ id: lessons.id });
        return row;
      },
    );
    revalidatePath(`/portal/courses/${data.courseId}`);
    return { ok: true, data: created };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function updateLesson(
  id: string,
  input: { title?: string; body?: string | null },
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canEdit(profile.role))
    return { ok: false, error: "Your role can't edit lessons." };
  const engagementId = await resolveEngagementIdFromRecord("lessons", id);
  if (!engagementId) return { ok: false, error: "Lesson not found." };
  try {
    await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        const update: Partial<typeof lessons.$inferInsert> = {};
        if (input.title !== undefined) update.title = input.title;
        if (input.body !== undefined) update.body = input.body;
        if (Object.keys(update).length === 0) return;
        await tx.update(lessons).set(update).where(eq(lessons.id, id));
      },
    );
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function deleteLesson(id: string): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canEdit(profile.role))
    return { ok: false, error: "Your role can't delete lessons." };
  const engagementId = await resolveEngagementIdFromRecord("lessons", id);
  if (!engagementId) return { ok: false, error: "Lesson not found." };
  try {
    await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        await tx.delete(lessons).where(eq(lessons.id, id));
      },
    );
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/* --------------------------------- cohort --------------------------------- */

const createCohortSchema = z.object({
  courseId: z.string().uuid(),
  name: z.string().min(1).max(200),
  status: cohortStatus.default("upcoming"),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
});

export async function createCohort(
  input: z.input<typeof createCohortSchema>,
): Promise<ActionResult<{ id: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canEdit(profile.role))
    return { ok: false, error: "Your role can't add cohorts." };
  const parsed = createCohortSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  const data = parsed.data;
  const engagementId = await resolveEngagementIdFromRecord(
    "courses",
    data.courseId,
  );
  if (!engagementId) return { ok: false, error: "Course not found." };
  try {
    const created = await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx, boundOrgId) => {
        const [row] = await tx
          .insert(cohorts)
          .values({
            orgId: boundOrgId,
            courseId: data.courseId,
            name: data.name,
            status: data.status,
            startsAt: data.startsAt ? new Date(data.startsAt) : null,
            endsAt: data.endsAt ? new Date(data.endsAt) : null,
          })
          .returning({ id: cohorts.id });
        return row;
      },
    );
    revalidatePath(`/portal/courses/${data.courseId}`);
    return { ok: true, data: created };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/* ------------------------------ enrollment ------------------------------ */

const enrollSchema = z.object({
  courseId: z.string().uuid(),
  cohortId: z.string().uuid().nullable().optional(),
  userProfileId: z.string().uuid(),
});

export async function enrollUser(
  input: z.input<typeof enrollSchema>,
): Promise<ActionResult<{ id: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canEdit(profile.role))
    return { ok: false, error: "Your role can't enroll users." };
  const parsed = enrollSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  const data = parsed.data;
  const engagementId = await resolveEngagementIdFromRecord(
    "courses",
    data.courseId,
  );
  if (!engagementId) return { ok: false, error: "Course not found." };
  try {
    const created = await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx, boundOrgId) => {
        const [row] = await tx
          .insert(enrollments)
          .values({
            orgId: boundOrgId,
            courseId: data.courseId,
            cohortId: data.cohortId ?? null,
            userProfileId: data.userProfileId,
          })
          .returning({ id: enrollments.id });
        return row;
      },
    );
    revalidatePath(`/portal/courses/${data.courseId}`);
    return { ok: true, data: created };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/* ----------------------------- learner: lesson progress ----------------------------- */

export async function markLessonComplete(
  lessonId: string,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  const engagementId = await resolveEngagementIdFromRecord(
    "lessons",
    lessonId,
  );
  if (!engagementId) return { ok: false, error: "Lesson not found." };
  try {
    await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx, boundOrgId) => {
        // Idempotent — composite PK means a re-mark is a no-op.
        await tx
          .insert(lessonCompletions)
          .values({
            lessonId,
            userProfileId: profile.userProfileId,
            orgId: boundOrgId,
          })
          .onConflictDoNothing();
      },
    );
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function unmarkLessonComplete(
  lessonId: string,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  const engagementId = await resolveEngagementIdFromRecord(
    "lessons",
    lessonId,
  );
  if (!engagementId) return { ok: false, error: "Lesson not found." };
  try {
    await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        await tx
          .delete(lessonCompletions)
          .where(
            and(
              eq(lessonCompletions.lessonId, lessonId),
              eq(lessonCompletions.userProfileId, profile.userProfileId),
            ),
          );
      },
    );
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function setEnrollmentStatus(
  id: string,
  status: EnrollmentStatus,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  const engagementId = await resolveEngagementIdFromRecord(
    "enrollments",
    id,
  );
  if (!engagementId) return { ok: false, error: "Enrollment not found." };
  try {
    await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        await tx
          .update(enrollments)
          .set({
            status,
            ...(status === "completed" ? { completedAt: new Date() } : {}),
          })
          .where(eq(enrollments.id, id));
      },
    );
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
