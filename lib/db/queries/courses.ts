import { and, asc, eq, inArray } from "drizzle-orm";
import {
  cohorts,
  courses,
  enrollments,
  lessonCompletions,
  lessons,
  userProfiles,
  type Cohort,
  type Course,
  type Enrollment,
  type Lesson,
} from "../schema";
import {
  resolveEngagementIdFromRecord,
  withEngagementContext,
} from "../tenant";
import { ensureUserProfile } from "../provisioning";

export async function listEngagementCourses(
  engagementId: string,
): Promise<Course[]> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return [];
  try {
    return await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) =>
        tx.select().from(courses).where(eq(courses.engagementId, engagementId)),
    );
  } catch {
    return [];
  }
}

export type CourseWithChildren = Course & {
  lessons: Lesson[];
  cohorts: Cohort[];
  enrollments: Array<Enrollment & { userName: string }>;
};

export type CourseLearnerView = {
  course: Course;
  lessons: Array<Lesson & { completedAt: Date | null }>;
  enrollment: Enrollment | null;
};

/** Learner view of a course: lessons in order plus this user's
 *  completion state per lesson. Returns null when the course doesn't
 *  exist or the caller can't see it. */
export async function getCourseLearnerView(
  id: string,
): Promise<CourseLearnerView | null> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return null;
  const engagementId = await resolveEngagementIdFromRecord("courses", id);
  if (!engagementId) return null;
  try {
    return await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        const [course] = await tx
          .select()
          .from(courses)
          .where(eq(courses.id, id))
          .limit(1);
        if (!course) return null;
        const lessonRows = await tx
          .select()
          .from(lessons)
          .where(eq(lessons.courseId, id))
          .orderBy(asc(lessons.orderIndex));
        const lessonIds = lessonRows.map((l) => l.id);
        const completionRows =
          lessonIds.length === 0
            ? []
            : await tx
                .select()
                .from(lessonCompletions)
                .where(
                  and(
                    eq(lessonCompletions.userProfileId, profile.userProfileId),
                    inArray(lessonCompletions.lessonId, lessonIds),
                  ),
                );
        const doneAt = new Map<string, Date>();
        for (const row of completionRows) {
          doneAt.set(row.lessonId, row.completedAt);
        }
        const [enrollmentRow] = await tx
          .select()
          .from(enrollments)
          .where(
            and(
              eq(enrollments.courseId, id),
              eq(enrollments.userProfileId, profile.userProfileId),
            ),
          )
          .limit(1);
        return {
          course,
          lessons: lessonRows.map((l) => ({
            ...l,
            completedAt: doneAt.get(l.id) ?? null,
          })),
          enrollment: enrollmentRow ?? null,
        };
      },
    );
  } catch {
    return null;
  }
}

export async function getCourseWithChildren(
  id: string,
): Promise<CourseWithChildren | null> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return null;
  const engagementId = await resolveEngagementIdFromRecord("courses", id);
  if (!engagementId) return null;
  try {
    return await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        const [course] = await tx
          .select()
          .from(courses)
          .where(eq(courses.id, id))
          .limit(1);
        if (!course) return null;
        const [lessonRows, cohortRows, enrollmentRows] = await Promise.all([
          tx
            .select()
            .from(lessons)
            .where(eq(lessons.courseId, id))
            .orderBy(asc(lessons.orderIndex)),
          tx
            .select()
            .from(cohorts)
            .where(eq(cohorts.courseId, id))
            .orderBy(asc(cohorts.startsAt)),
          tx
            .select({
              enrollment: enrollments,
              userName: userProfiles.fullName,
            })
            .from(enrollments)
            .innerJoin(
              userProfiles,
              eq(userProfiles.id, enrollments.userProfileId),
            )
            .where(eq(enrollments.courseId, id)),
        ]);
        return {
          ...course,
          lessons: lessonRows,
          cohorts: cohortRows,
          enrollments: enrollmentRows.map((r) => ({
            ...r.enrollment,
            userName: r.userName,
          })),
        };
      },
    );
  } catch {
    return null;
  }
}
