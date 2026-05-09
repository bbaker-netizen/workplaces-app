"use server";

/**
 * Projects + tasks — server actions.
 *
 * Phase 1.14. Two record types in one file because they're tightly
 * coupled and most flows touch both. Authorization: leadership-only
 * (master_admin / coach / client_lead / client_manager).
 */

import { eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  projects,
  tasks,
  type UserProfile,
} from "@/lib/db/schema";
import {
  resolveEngagementIdFromRecord,
  withEngagementContext,
} from "@/lib/db/tenant";

type Role = UserProfile["role"];

const LEADERSHIP_ROLES: ReadonlyArray<Role> = [
  "master_admin",
  "coach",
  "client_lead",
  "client_manager",
];
function canEdit(role: Role): boolean {
  return (LEADERSHIP_ROLES as readonly string[]).includes(role);
}

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/* ------------------------------- projects ------------------------------- */

const projectStatusEnum = z.enum([
  "planning",
  "active",
  "blocked",
  "completed",
  "cancelled",
]);

const createProjectSchema = z.object({
  engagementId: z.string().uuid(),
  name: z.string().min(1, "Name is required").max(500),
  description: z.string().max(20000).nullable().optional(),
  status: projectStatusEnum.default("planning"),
  leadUserProfileId: z.string().uuid().nullable().optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .nullable()
    .optional(),
  targetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .nullable()
    .optional(),
  revenueImpact: z.boolean().default(false),
  marginImpact: z.boolean().default(false),
});

const updateProjectSchema = createProjectSchema
  .partial()
  .omit({ engagementId: true });

export type CreateProjectInput = z.input<typeof createProjectSchema>;
export type UpdateProjectInput = z.input<typeof updateProjectSchema>;

function revalidateProjectPaths(projectId?: string) {
  revalidatePath("/portal/projects");
  revalidatePath("/coach/projects");
  if (projectId) {
    revalidatePath(`/portal/projects/${projectId}`);
    revalidatePath(`/coach/projects/${projectId}`);
  }
}

export async function createProject(
  input: CreateProjectInput,
): Promise<ActionResult<{ id: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  if (!canEdit(profile.role)) {
    return { ok: false, error: "Your role can't create projects." };
  }
  const parsed = createProjectSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const data = parsed.data;
  if (!data.revenueImpact && !data.marginImpact) {
    return {
      ok: false,
      error:
        "Projects must move top-line revenue, protect margin, or both.",
    };
  }
  try {
    const created = await withEngagementContext(
      profile.orgId,
      profile.role,
      data.engagementId,
      async (tx, boundOrgId) => {
        const [row] = await tx
          .insert(projects)
          .values({
            orgId: boundOrgId,
            engagementId: data.engagementId,
            name: data.name,
            description: data.description ?? null,
            status: data.status,
            leadUserProfileId: data.leadUserProfileId ?? null,
            startDate: data.startDate ? new Date(data.startDate) : null,
            targetDate: data.targetDate ? new Date(data.targetDate) : null,
            revenueImpact: data.revenueImpact,
            marginImpact: data.marginImpact,
          })
          .returning({ id: projects.id });
        return row;
      },
    );
    revalidateProjectPaths();
    return { ok: true, data: created };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function updateProject(
  id: string,
  input: UpdateProjectInput,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  if (!canEdit(profile.role)) {
    return { ok: false, error: "Your role can't edit projects." };
  }
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid id." };
  }
  const parsed = updateProjectSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const data = parsed.data;

  const engagementId = await resolveEngagementIdFromRecord("projects", id);
  if (!engagementId) {
    return { ok: false, error: "Project not found." };
  }
  try {
    await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        const [existing] = await tx
          .select()
          .from(projects)
          .where(eq(projects.id, id))
          .limit(1);
        if (!existing) throw new Error("Project not found.");
        const update: Partial<typeof projects.$inferInsert> = {};
        if (data.name !== undefined) update.name = data.name;
        if (data.description !== undefined)
          update.description = data.description;
        if (data.status !== undefined) update.status = data.status;
        if (data.leadUserProfileId !== undefined)
          update.leadUserProfileId = data.leadUserProfileId;
        if (data.startDate !== undefined)
          update.startDate = data.startDate
            ? new Date(data.startDate)
            : null;
        if (data.targetDate !== undefined)
          update.targetDate = data.targetDate
            ? new Date(data.targetDate)
            : null;
        if (data.revenueImpact !== undefined)
          update.revenueImpact = data.revenueImpact;
        if (data.marginImpact !== undefined)
          update.marginImpact = data.marginImpact;
        const finalRevenue = update.revenueImpact ?? existing.revenueImpact;
        const finalMargin = update.marginImpact ?? existing.marginImpact;
        if (!finalRevenue && !finalMargin) {
          throw new Error(
            "Projects must move top-line revenue, protect margin, or both.",
          );
        }
        if (Object.keys(update).length === 0) return;
        await tx.update(projects).set(update).where(eq(projects.id, id));
      },
    );
    revalidateProjectPaths(id);
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function deleteProject(id: string): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  if (!canEdit(profile.role)) {
    return { ok: false, error: "Your role can't delete projects." };
  }
  const engagementId = await resolveEngagementIdFromRecord("projects", id);
  if (!engagementId) {
    return { ok: false, error: "Project not found." };
  }
  try {
    await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        await tx.delete(projects).where(eq(projects.id, id));
      },
    );
    revalidateProjectPaths();
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/* -------------------------------- tasks -------------------------------- */

const taskStatusEnum = z.enum(["todo", "in_progress", "done", "blocked"]);

const createTaskSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1, "Title is required").max(500),
  description: z.string().max(20000).nullable().optional(),
  status: taskStatusEnum.default("todo"),
  assigneeUserProfileId: z.string().uuid().nullable().optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .nullable()
    .optional(),
  percentComplete: z.number().int().min(0).max(100).default(0),
});

const updateTaskSchema = createTaskSchema.partial().omit({ projectId: true });

export type CreateTaskInput = z.input<typeof createTaskSchema>;
export type UpdateTaskInput = z.input<typeof updateTaskSchema>;

export async function createTask(
  input: CreateTaskInput,
): Promise<ActionResult<{ id: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  if (!canEdit(profile.role)) {
    return { ok: false, error: "Your role can't create tasks." };
  }
  const parsed = createTaskSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const data = parsed.data;
  const engagementId = await resolveEngagementIdFromRecord(
    "projects",
    data.projectId,
  );
  if (!engagementId) {
    return { ok: false, error: "Project not found." };
  }
  try {
    const created = await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx, boundOrgId) => {
        // Determine the next order_index for the project.
        const [{ maxOrder } = { maxOrder: 0 }] = await tx
          .select({ maxOrder: max(tasks.orderIndex) })
          .from(tasks)
          .where(eq(tasks.projectId, data.projectId));
        const [row] = await tx
          .insert(tasks)
          .values({
            orgId: boundOrgId,
            projectId: data.projectId,
            title: data.title,
            description: data.description ?? null,
            status: data.status,
            assigneeUserProfileId: data.assigneeUserProfileId ?? null,
            dueDate: data.dueDate ? new Date(data.dueDate) : null,
            percentComplete: data.percentComplete,
            orderIndex: (Number(maxOrder) || 0) + 1,
          })
          .returning({ id: tasks.id });
        return row;
      },
    );
    revalidateProjectPaths(data.projectId);
    return { ok: true, data: created };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function updateTask(
  id: string,
  input: UpdateTaskInput,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid id." };
  }
  const parsed = updateTaskSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const data = parsed.data;
  const engagementId = await resolveEngagementIdFromRecord("tasks", id);
  if (!engagementId) {
    return { ok: false, error: "Task not found." };
  }
  try {
    const projectId = await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        const [existing] = await tx
          .select()
          .from(tasks)
          .where(eq(tasks.id, id))
          .limit(1);
        if (!existing) throw new Error("Task not found.");

        // Status-only restriction for non-leadership: only the assignee
        // can update status, and they can update *only* status.
        if (!canEdit(profile.role)) {
          if (existing.assigneeUserProfileId !== profile.userProfileId) {
            throw new Error("You can only update tasks assigned to you.");
          }
          const restrictedKeys = [
            "title",
            "description",
            "assigneeUserProfileId",
            "dueDate",
          ] as const;
          for (const k of restrictedKeys) {
            if (data[k] !== undefined) {
              throw new Error(
                `Your role can update status / progress only — not ${k}.`,
              );
            }
          }
        }

        const update: Partial<typeof tasks.$inferInsert> = {};
        if (data.title !== undefined) update.title = data.title;
        if (data.description !== undefined)
          update.description = data.description;
        if (data.status !== undefined) update.status = data.status;
        if (data.assigneeUserProfileId !== undefined)
          update.assigneeUserProfileId = data.assigneeUserProfileId;
        if (data.dueDate !== undefined)
          update.dueDate = data.dueDate ? new Date(data.dueDate) : null;
        if (data.percentComplete !== undefined)
          update.percentComplete = data.percentComplete;

        if (Object.keys(update).length === 0) return existing.projectId;
        await tx.update(tasks).set(update).where(eq(tasks.id, id));
        return existing.projectId;
      },
    );
    revalidateProjectPaths(projectId);
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function deleteTask(id: string): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  if (!canEdit(profile.role)) {
    return { ok: false, error: "Your role can't delete tasks." };
  }
  const engagementId = await resolveEngagementIdFromRecord("tasks", id);
  if (!engagementId) {
    return { ok: false, error: "Task not found." };
  }
  try {
    const projectId = await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        const [existing] = await tx
          .select({ projectId: tasks.projectId })
          .from(tasks)
          .where(eq(tasks.id, id))
          .limit(1);
        if (!existing) throw new Error("Task not found.");
        await tx.delete(tasks).where(eq(tasks.id, id));
        return existing.projectId;
      },
    );
    revalidateProjectPaths(projectId);
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

