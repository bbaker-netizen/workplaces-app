/**
 * Projects + tasks — read queries (server-side only).
 */

import { asc, eq, inArray } from "drizzle-orm";
import {
  projects,
  tasks,
  userProfiles,
  type Project,
  type Task,
} from "../schema";
import {
  resolveEngagementIdFromRecord,
  withEngagementContext,
} from "../tenant";
import { ensureUserProfile } from "../provisioning";

export type ListedProject = Project & {
  leadName: string | null;
  taskCount: number;
  taskCountDone: number;
};

export async function listEngagementProjects(
  engagementId: string,
): Promise<ListedProject[]> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return [];
  try {
    return await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        const rows = await tx
          .select({
            project: projects,
            leadName: userProfiles.fullName,
          })
          .from(projects)
          .leftJoin(
            userProfiles,
            eq(userProfiles.id, projects.leadUserProfileId),
          )
          .where(eq(projects.engagementId, engagementId));
        if (rows.length === 0) return [];

        const projectIds = rows.map((r) => r.project.id);
        const taskRows = await tx
          .select({
            projectId: tasks.projectId,
            status: tasks.status,
          })
          .from(tasks)
          .where(inArray(tasks.projectId, projectIds));
        return rows.map((r) => {
          const ts = taskRows.filter((t) => t.projectId === r.project.id);
          return {
            ...r.project,
            leadName: r.leadName,
            taskCount: ts.length,
            taskCountDone: ts.filter((t) => t.status === "done").length,
          };
        });
      },
    );
  } catch {
    return [];
  }
}

export type LoadedProject = Project & {
  leadName: string | null;
  tasks: Array<Task & { assigneeName: string | null }>;
};

export async function getProjectWithTasks(
  id: string,
): Promise<LoadedProject | null> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return null;
  const engagementId = await resolveEngagementIdFromRecord("projects", id);
  if (!engagementId) return null;
  try {
    return await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        const [row] = await tx
          .select({
            project: projects,
            leadName: userProfiles.fullName,
          })
          .from(projects)
          .leftJoin(
            userProfiles,
            eq(userProfiles.id, projects.leadUserProfileId),
          )
          .where(eq(projects.id, id))
          .limit(1);
        if (!row) return null;
        const taskRows = await tx
          .select({
            task: tasks,
            assigneeName: userProfiles.fullName,
          })
          .from(tasks)
          .leftJoin(
            userProfiles,
            eq(userProfiles.id, tasks.assigneeUserProfileId),
          )
          .where(eq(tasks.projectId, id))
          .orderBy(asc(tasks.orderIndex));
        return {
          ...row.project,
          leadName: row.leadName,
          tasks: taskRows.map((t) => ({
            ...t.task,
            assigneeName: t.assigneeName,
          })),
        };
      },
    );
  } catch {
    return null;
  }
}
