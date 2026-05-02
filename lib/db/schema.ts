/**
 * The Builder — Phase 0 core schema.
 *
 * Scope (Phase 0 only): orgs, user_profiles, coaches, engagements,
 * and the supporting enums. Other entities listed in CLAUDE.md
 * "Domain Model" land in later phases.
 *
 * Multi-tenancy: every tenant-scoped table carries an `org_id` column.
 * Row-Level Security policies referencing `auth.org_id()` are added
 * in a separate migration (Phase 0, Step 4). Phase 0 RLS predicate is
 * `org_id = auth.org_id()`; cross-org coach visibility is a Phase 1+
 * concern handled via a future engagement_membership junction.
 */

import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  index,
} from "drizzle-orm/pg-core";

// ---------- Enums ----------

export const roleEnum = pgEnum("role", [
  "coach",
  "master_admin",
  "client_lead",
  "client_manager",
  "client_employee",
  "prospect",
]);

export const orgTypeEnum = pgEnum("org_type", ["master", "client"]);

export const engagementTypeEnum = pgEnum("engagement_type", [
  "accelerator",
  "implementer",
]);

export const engagementStatusEnum = pgEnum("engagement_status", [
  "prospect",
  "active",
  "paused",
  "completed",
  "renewed",
]);

export const coachStatusEnum = pgEnum("coach_status", [
  "active",
  "deferred",
  "archived",
]);

// ---------- Tables ----------

/**
 * `orgs` — tenants.
 *
 * One row per Workplaces org (the master) and per client engagement
 * org. The row's `id` IS the tenant discriminator that RLS compares
 * against, so this table doesn't carry a separate `org_id` column.
 *
 * `clerk_org_id` is the foreign reference to Clerk Organizations,
 * which manage membership and auth. Domain-specific data lives here.
 */
export const orgs = pgTable("orgs", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkOrgId: text("clerk_org_id").notNull().unique(),
  name: text("name").notNull(),
  type: orgTypeEnum("type").notNull().default("client"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * `user_profiles` — app-side extension of a Clerk user.
 *
 * One row per person with a login. `clerk_user_id` is the stable
 * identifier sourced from Clerk; everything else is what The Builder
 * needs that Clerk doesn't store (role, org affiliation, display
 * preferences once we add them).
 *
 * `org_id` is the user's *home* org — Workplaces master for coaches,
 * the client org for client members. A user belonging to multiple orgs
 * (e.g. a coach with read access into a client portal) is modeled in a
 * later phase via a junction; Phase 0 keeps a single row per user.
 */
export const userProfiles = pgTable(
  "user_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkUserId: text("clerk_user_id").notNull().unique(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    fullName: text("full_name").notNull(),
    role: roleEnum("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("user_profiles_org_idx").on(t.orgId),
  })
);

/**
 * `coaches` — Workplaces coaches (Bruce, Jen, future hires).
 *
 * One row per coach person, FK to their user_profile. Coach-specific
 * fields live here; identity/auth lives on user_profile. The owning
 * org is always the Workplaces master org (enforced in seeds and at
 * the application layer; a CHECK constraint can be added later).
 */
export const coaches = pgTable(
  "coaches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    userProfileId: uuid("user_profile_id")
      .notNull()
      .unique()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    status: coachStatusEnum("status").notNull().default("active"),
    startDate: timestamp("start_date", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("coaches_org_idx").on(t.orgId),
  })
);

/**
 * `engagements` — the active coaching relationship.
 *
 * Belongs to a CLIENT org (the `org_id`). Owned by a Coach from the
 * master org. `type` is Accelerator or Implementer per the
 * methodology; `status` tracks the lifecycle from prospect to renewal.
 *
 * Phase 0 RLS predicate is `org_id = auth.org_id()`, so a client
 * sees only their own engagement. Coach cross-org visibility is
 * handled in a later phase (Phase 1+).
 */
export const engagements = pgTable(
  "engagements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    coachId: uuid("coach_id")
      .notNull()
      .references(() => coaches.id),
    type: engagementTypeEnum("type").notNull(),
    status: engagementStatusEnum("status").notNull().default("active"),
    name: text("name"),
    startDate: timestamp("start_date", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("engagements_org_idx").on(t.orgId),
    coachIdx: index("engagements_coach_idx").on(t.coachId),
  })
);

// ---------- Inferred TypeScript types ----------

export type Org = typeof orgs.$inferSelect;
export type NewOrg = typeof orgs.$inferInsert;
export type UserProfile = typeof userProfiles.$inferSelect;
export type NewUserProfile = typeof userProfiles.$inferInsert;
export type Coach = typeof coaches.$inferSelect;
export type NewCoach = typeof coaches.$inferInsert;
export type Engagement = typeof engagements.$inferSelect;
export type NewEngagement = typeof engagements.$inferInsert;
