import { asc, eq } from "drizzle-orm";
import {
  cohorts,
  courses,
  enrollments,
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
