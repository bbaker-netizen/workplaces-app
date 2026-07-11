/**
 * The Builder — application schema.
 *
 * Phase 0: orgs, user_profiles, coaches, engagements, role/org_type/
 *   engagement_type/engagement_status/coach_status enums.
 * Phase 1.1: action_items, messages, documents, document_tags,
 *   notifications + supporting enums; engagements gains a started_at
 *   column to distinguish record-creation from active-engagement time.
 *
 * Multi-tenancy: every tenant-scoped table carries an `org_id` column.
 * Row-Level Security policies referencing `auth.org_id()` are added in
 * separate migrations (0001 for Phase 0 tables, 0003 for Phase 1.1
 * tables). All RLS predicates are `org_id = auth.org_id()`; cross-org
 * Coach visibility (Coach My Work) is a Phase 2+ concern handled via a
 * future engagement_membership junction.
 */

import {
  type AnyPgColumn,
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ---------- Phase 0 enums ----------

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

// ---------- Phase 1.1 enums ----------

export const actionItemStatusEnum = pgEnum("action_item_status", [
  "draft",
  "open",
  "in_progress",
  "done",
  "blocked",
]);

export const actionItemCreatedByEnum = pgEnum("action_item_created_by", [
  "coach",
  "claude",
]);

export const confidenceFlagEnum = pgEnum("confidence_flag", [
  "high",
  "medium",
  "low",
]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "mention",
  "action_item_assigned",
  "action_item_due_soon",
  "message",
  "document",
]);

export const notificationSentViaEnum = pgEnum("notification_sent_via", [
  "email",
  "in_app",
  "both",
]);

// ---------- Phase 1.6 enums ----------

export const bbsSessionTypeEnum = pgEnum("bbs_session_type", [
  "in_person",
  "virtual",
]);

export const bbsSessionStatusEnum = pgEnum("bbs_session_status", [
  "scheduled",
  "completed",
  "cancelled",
]);

// ---------- Phase 1.10 enums ----------

export const goalStatusEnum = pgEnum("goal_status", [
  "open",
  "in_progress",
  "achieved",
  "missed",
  "abandoned",
]);

// ---------- Phase 3 enums ----------

export const portalModuleEnum = pgEnum("portal_module", [
  "action_items",
  "calendar",
  "goals",
  "projects",
  "sessions",
  "soul_file",
  "deliverables",
  "communication",
  "documents",
  "courses",
  "forms",
  "team",
  "invoices",
  "methodology",
  "embedded_apps",
  "subscriptions",
  "hiring",
  "notes",
  "meetings",
]);

export const prospectStatusEnum = pgEnum("prospect_status", [
  "new_lead",            // Just came in, no contact yet
  "diagnostic_pending",  // Legacy (retired) — remapped to contact_attempted
  "contact_attempted",   // Reached out, no reply yet
  "first_contact",       // First contact made
  "meeting_scheduled",   // "Appt booked"
  "appt_completed_followup", // Appt completed — follow-up required
  "diagnostic_complete", // Legacy (retired) — remapped to first_contact
  "proposal_sent",
  "negotiation",         // Legacy (retired) — remapped to proposal_sent
  "contract_sent",
  "contract_signed",
  "onboarded",           // "Won"
  "lost",
  "not_qualified",       // Disqualified
]);

/** Canonical acquisition channel for a prospect — the attribution key
 *  the lead-source spend report is built on. See lib/pipeline/lead-source.ts
 *  for labels + the legacy/webhook mapping helpers. Stored NOT NULL on
 *  every prospect (enforced in migration 0079). */
export const leadSourceChannelEnum = pgEnum("lead_source_channel", [
  "google_ads",
  "meta",
  "organic_search",
  "direct",
  "referral",
  "podcast",
  "linkedin",
  "cold_inbound",
  "other",
]);

export const personProfileSourceEnum = pgEnum("person_profile_source", [
  "tti_trimetrix_hd",
  "manual",
]);

export const schedulingMeetingTypeEnum = pgEnum("scheduling_meeting_type", [
  "discovery",
  "bbs",
  "ad_hoc",
]);

// ---------- Phase 2 audit log ----------

export const auditEventTypeEnum = pgEnum("audit_event_type", [
  "create",
  "update",
  "delete",
  "publish",
  "transfer",
  "login",
  "permission_change",
  "ai_generation",
  "webhook_received",
]);

// ---------- Phase 1.14 enums ----------

export const projectStatusEnum = pgEnum("project_status", [
  "planning",
  "active",
  "blocked",
  "completed",
  "cancelled",
]);

export const taskStatusEnum = pgEnum("task_status", [
  "todo",
  "in_progress",
  "done",
  "blocked",
]);

// ---------- Phase 1.15 enums ----------

export const hireStatusEnum = pgEnum("hire_status", [
  "assessing",
  "interview_scheduled",
  "decision_pending",
  "offer_sent",
  "hired",
  "declined",
]);

// ---------- Phase 1.16–1.19 enums ----------

export const formTypeEnum = pgEnum("form_type", [
  "diagnostic",
  "intake",
  "pulse",
  "nps",
  "custom",
]);

export const deliverableTypeEnum = pgEnum("deliverable_type", [
  "sop",
  "org_chart",
  "job_profile",
  "financial_dashboard",
  "onboarding_guide",
  "operations_setup_guide",
  "business_plan",
  "marketing_plan",
  "stages_of_growth_assessment",
]);

export const deliverableStatusEnum = pgEnum("deliverable_status", [
  "not_started",
  "in_progress",
  "review",
  "delivered",
  "archived",
]);

export const embeddedAppAuthModeEnum = pgEnum("embedded_app_auth_mode", [
  "public",
  "token_passthrough",
  "clerk_sso",
]);

export const courseDeliveryModeEnum = pgEnum("course_delivery_mode", [
  "self_paced",
  "cohort",
]);

export const cohortStatusEnum = pgEnum("cohort_status", [
  "upcoming",
  "in_progress",
  "completed",
  "cancelled",
]);

export const enrollmentStatusEnum = pgEnum("enrollment_status", [
  "enrolled",
  "in_progress",
  "completed",
  "dropped",
]);

// ---------- Phase 0 tables ----------

/**
 * `orgs` — tenants.
 *
 * One row per Workplaces master org and per client engagement org.
 * The row's `id` IS the tenant discriminator that RLS compares against,
 * so this table doesn't carry a separate `org_id` column.
 *
 * `clerk_org_id` references a real Clerk Organization (Phase 1.1 onward;
 * Phase 0 used the user's own Clerk id as a placeholder, retired during
 * the 1.1 cutover).
 */
export const orgs = pgTable("orgs", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkOrgId: text("clerk_org_id").notNull().unique(),
  /** Display name (shown in nav, emails, etc.). For your own master
   *  org this is "Workplaces". For client orgs this is the client's
   *  company name. */
  name: text("name").notNull(),
  /** Legal entity name (e.g. "HR All-In Inc."). Used in contract
   *  preambles. Falls back to `name` when not set. */
  legalName: text("legal_name"),
  /** Street address — single-line, the way it appears on a letter
   *  or invoice. */
  businessAddress: text("business_address"),
  businessCity: text("business_city"),
  businessProvince: text("business_province"),
  businessCountry: text("business_country"),
  businessPostalCode: text("business_postal_code"),
  businessPhone: text("business_phone"),
  businessWebsite: text("business_website"),
  /** Government tax ID — GST/HST in Canada, EIN in the US, VAT in
   *  the EU. Used on invoices. */
  taxId: text("tax_id"),
  type: orgTypeEnum("type").notNull().default("client"),
  // Lead-capture webhook secret (migration 0068). Secures the public
  // /api/leads/<token> endpoint that external channels POST leads to.
  leadWebhookToken: text("lead_webhook_token"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * `user_profiles` — app-side extension of a Clerk user.
 *
 * One row per person with a login. `clerk_user_id` is the stable
 * identifier from Clerk; `org_id` is the user's home org (the master
 * org for coaches, the client org for client members). Multi-org
 * membership for coaches is a Phase 2+ junction-table concern.
 *
 * `role` is set from invitation metadata at provisioning time
 * (Phase 1.1 onward); Phase 0 set everyone to master_admin during
 * its single-test-user phase.
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
    // Phase 4.5: stored signature image (data:image/png;base64,…) for
    // coaches who pre-apply their signature when creating envelopes.
    signatureImageData: text("signature_image_data"),
    // Phase 5: email signature appended to outbound emails sent from
    // the communications panel. Plain text.
    emailSignature: text("email_signature"),
    // Per-user Anthropic API key for Ask Buddy (Builder Buddy). Each
    // Business Builder supplies their own; stored encrypted via secret-vault.
    anthropicApiKey: text("anthropic_api_key"),
    // Per-user Twilio "from" number (E.164). When set, this Business
    // Builder's outbound SMS sends from this number so clients see them,
    // not the shared practice number.
    smsFromNumber: text("sms_from_number"),
    // Phase 5: per-user UI prefs (migration 0021). Follow the user across
    // devices so the system feels remembered. Pipeline columns + home
    // dashboard layout are owned by their respective features.
    pinnedNavItems: text("pinned_nav_items")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    sidebarCollapsed: boolean("sidebar_collapsed").notNull().default(false),
    pipelineColumnPrefs: jsonb("pipeline_column_prefs"),
    homeDashboardLayout: jsonb("home_dashboard_layout"),
    // Business Builder access control. master_admin configures other
    // Business Builders' reach. `allClientsAccess` true (default) = sees
    // every client, preserving prior behaviour; false = limited to the
    // explicit grants in `bb_client_access`. `allowedConsoleModules` lists
    // the console nav hrefs the user may use; null = all of them.
    // master_admin always bypasses both checks in app logic.
    allClientsAccess: boolean("all_clients_access").notNull().default(true),
    allowedConsoleModules: jsonb("allowed_console_modules").$type<string[] | null>(),
    // First-login onboarding (migration 0066). NULL = show the welcome +
    // setup checklist on next console visit; set = already welcomed.
    onboardingCompletedAt: timestamp("onboarding_completed_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("user_profiles_org_idx").on(t.orgId),
  })
);

/**
 * `bb_client_access` — explicit per-client grants for a Business Builder
 * whose `user_profiles.all_clients_access` is false. One row = "this
 * Business Builder may access this engagement." Lives in the master org
 * (org_id = the Business Builder's home/master org). master_admin manages
 * these; enforcement reads them when resolving which clients a restricted
 * Business Builder can see.
 */
export const bbClientAccess = pgTable(
  "bb_client_access",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    coachUserProfileId: uuid("coach_user_profile_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("bb_client_access_org_idx").on(t.orgId),
    coachIdx: index("bb_client_access_coach_idx").on(t.coachUserProfileId),
    uniqueGrant: uniqueIndex("bb_client_access_coach_engagement_unique").on(
      t.coachUserProfileId,
      t.engagementId,
    ),
  })
);

/**
 * `coaches` — Workplaces Business Builders (Bruce, Jen, future hires).
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
 * `bb_invite_access` — access a master admin pre-sets for an invited
 * Business Builder, keyed by email. Applied to their user_profile +
 * bb_client_access grants when they accept and sign up, then deleted.
 */
export const bbInviteAccess = pgTable(
  "bb_invite_access",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    allClientsAccess: boolean("all_clients_access").notNull().default(true),
    allowedConsoleModules: jsonb("allowed_console_modules").$type<string[] | null>(),
    grantedEngagementIds: jsonb("granted_engagement_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("bb_invite_access_org_idx").on(t.orgId),
  })
);

/**
 * `engagements` — the active coaching relationship.
 *
 * `started_at` (Phase 1.1) is the moment the engagement actually became
 * live in the methodology sense — distinct from `created_at` (the row's
 * birth) and from `start_date` (a planned/scheduled start). Backfill
 * from Adobe Sign envelope timestamps when we have them.
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
    startedAt: timestamp("started_at", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),
    qboCustomerId: text("qbo_customer_id"),
    qboRealmId: text("qbo_realm_id"),
    /** Lifetime payments received from this client via QuickBooks, in
     *  cents. Cached by the qbo-value-sync job (nightly + manual button);
     *  null until first sync or when QBO isn't connected. Drives the
     *  Pipeline "Value" column for clients — prospects without a QBO
     *  customer fall back to expected_value_cents. */
    qboLifetimePaymentsCents: bigint("qbo_lifetime_payments_cents", {
      mode: "number",
    }),
    qboValueSyncedAt: timestamp("qbo_value_synced_at", { withTimezone: true }),
    // Linked Google Drive folder for this engagement. When
    // `googleDriveManaged` is true the app created this folder and can
    // write into it (full two-way); otherwise it's a pasted, read-only
    // mirror of a folder Bruce owns elsewhere.
    googleDriveFolderId: text("google_drive_folder_id"),
    googleDriveFolderName: text("google_drive_folder_name"),
    googleDriveManaged: boolean("google_drive_managed").notNull().default(false),
    googleDriveLinkedByUserProfileId: uuid(
      "google_drive_linked_by_user_profile_id",
    ).references(() => userProfiles.id, { onDelete: "set null" }),
    googleDriveLinkedAt: timestamp("google_drive_linked_at", {
      withTimezone: true,
    }),
    stageOfGrowthStage: bigint("stage_of_growth_stage", { mode: "number" }),
    stageAssessedAt: timestamp("stage_assessed_at", { withTimezone: true }),
    slug: text("slug"),
    /** Soft-delete / archive for the whole engagement. When set, the
     *  client is removed from the Engagements list and their portal is
     *  closed off. Set when the coach archives the client (directly or by
     *  archiving their contact); cleared on restore. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    /** Monthly fee charged to this client, in cents. Surfaces as
     *  `{{monthly_fee}}` in document templates (rendered as
     *  "$2,500/month"). Set at engagement creation, pre-filled from
     *  the matching `pricing_tiers` row but always overridable. */
    monthlyFeeCents: bigint("monthly_fee_cents", { mode: "number" }),
    /** Optional tier key (e.g. 'small'/'mid'/'large') that the fee
     *  was originally suggested from. Lets us show drift over time
     *  ("you set this at $1,500 but the tier is now $1,800"). */
    pricingTier: text("pricing_tier"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("engagements_org_idx").on(t.orgId),
    coachIdx: index("engagements_coach_idx").on(t.coachId),
    slugIdx: uniqueIndex("engagements_slug_idx").on(t.slug),
  })
);

/**
 * `pricing_tiers` — per-org price grid that pre-fills the monthly fee
 * when creating an engagement.
 *
 * One row per (org, program, tier_key). The engagement creation form
 * fetches all of an org's rows, groups by program, and shows them as
 * radio-pill options. Picking one auto-fills the fee, but the field
 * stays editable for one-off overrides.
 *
 * Bruce manages the grid under /business-builder/settings/pricing.
 */
export const pricingTiers = pgTable(
  "pricing_tiers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    program: text("program").notNull(), // 'accelerator' | 'implementer'
    tierKey: text("tier_key").notNull(),
    label: text("label").notNull(),
    monthlyFeeCents: bigint("monthly_fee_cents", { mode: "number" }).notNull(),
    sortOrder: bigint("sort_order", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    orgIdx: index("pricing_tiers_org_idx").on(t.orgId, t.program, t.sortOrder),
    uniquePerOrg: uniqueIndex("pricing_tiers_unique_per_org").on(
      t.orgId,
      t.program,
      t.tierKey,
    ),
  }),
);

export type PricingTier = typeof pricingTiers.$inferSelect;
export type NewPricingTier = typeof pricingTiers.$inferInsert;

// ---------- Phase 1.1 tables ----------

/**
 * `projects` — discrete initiatives within an engagement.
 *
 * Phase 1.14. App builds, hiring drives, marketing campaigns,
 * implementation rollouts. Each project has a lead, dates, status,
 * and a task list. Per the methodology a project either moves
 * top-line revenue, protects margin, or both — same Quality Gate
 * as goals and action items.
 */
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    /** Optional link to the goal this project supports. A project
     *  may roll up under a goal or stand alone. Setting null detaches
     *  without deleting. Drives the Workspace tab's grouping. */
    goalId: uuid("goal_id").references((): AnyPgColumn => goals.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    description: text("description"),
    status: projectStatusEnum("status").notNull().default("planning"),
    leadUserProfileId: uuid("lead_user_profile_id").references(
      () => userProfiles.id,
      { onDelete: "set null" },
    ),
    startDate: timestamp("start_date", { withTimezone: true }),
    targetDate: timestamp("target_date", { withTimezone: true }),
    revenueImpact: boolean("revenue_impact").notNull().default(false),
    marginImpact: boolean("margin_impact").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("projects_org_idx").on(t.orgId),
    engagementIdx: index("projects_engagement_idx").on(t.engagementId),
    leadIdx: index("projects_lead_idx").on(t.leadUserProfileId),
    statusIdx: index("projects_status_idx").on(t.status),
    goalIdx: index("projects_goal_idx").on(t.goalId),
  }),
);

/**
 * `tasks` — work items within a project.
 *
 * Phase 1.14 keeps it lightweight: title, status, assignee, due date,
 * order index for manual drag-sort, percent_complete for progress
 * roll-ups. Dependencies + parent_task_id (sub-tasks) are deferred.
 */
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Parent task for sub-tasks. Null = top-level. Deleting a parent
     *  cascades to its sub-tasks. One level of nesting. */
    parentTaskId: uuid("parent_task_id").references(
      (): AnyPgColumn => tasks.id,
      { onDelete: "cascade" },
    ),
    title: text("title").notNull(),
    description: text("description"),
    status: taskStatusEnum("status").notNull().default("todo"),
    assigneeUserProfileId: uuid("assignee_user_profile_id").references(
      () => userProfiles.id,
      { onDelete: "set null" },
    ),
    orderIndex: bigint("order_index", { mode: "number" })
      .notNull()
      .default(0),
    dueDate: timestamp("due_date", { withTimezone: true }),
    percentComplete: bigint("percent_complete", { mode: "number" })
      .notNull()
      .default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("tasks_org_idx").on(t.orgId),
    projectIdx: index("tasks_project_idx").on(t.projectId),
    assigneeIdx: index("tasks_assignee_idx").on(t.assigneeUserProfileId),
    statusIdx: index("tasks_status_idx").on(t.status),
  }),
);

/**
 * `hires` — candidates moving through the hiring pipeline.
 *
 * Phase 1.15. Per CLAUDE.md spec: gap report PDF uploaded → stored
 * on the candidate record, generate buttons trigger existing
 * Workplaces skills via Claude API (gap-analysis, interview,
 * hiring, new-employee-onboarding). The AI generation buttons
 * land in Phase 2; for 1.15 we ship the data + manual upload paths.
 *
 * Document references (gap_report / resume / offer) point at the
 * shared `documents` table — uploaded via the existing /api/documents
 * pipeline so the same files appear under Documents AND on the
 * candidate's record.
 */
export const hires = pgTable(
  "hires",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    candidateName: text("candidate_name").notNull(),
    candidateEmail: text("candidate_email"),
    roleName: text("role_name").notNull(),
    status: hireStatusEnum("status").notNull().default("assessing"),
    gapReportDocumentId: uuid("gap_report_document_id").references(
      () => documents.id,
      { onDelete: "set null" },
    ),
    resumeDocumentId: uuid("resume_document_id").references(
      () => documents.id,
      { onDelete: "set null" },
    ),
    offerDocumentId: uuid("offer_document_id").references(
      () => documents.id,
      { onDelete: "set null" },
    ),
    notes: text("notes"),
    interviewScheduledAt: timestamp("interview_scheduled_at", {
      withTimezone: true,
    }),
    decisionAt: timestamp("decision_at", { withTimezone: true }),
    offerSentAt: timestamp("offer_sent_at", { withTimezone: true }),
    hiredAt: timestamp("hired_at", { withTimezone: true }),
    createdByUserProfileId: uuid("created_by_user_profile_id")
      .notNull()
      .references(() => userProfiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("hires_org_idx").on(t.orgId),
    engagementIdx: index("hires_engagement_idx").on(t.engagementId),
    statusIdx: index("hires_status_idx").on(t.status),
  }),
);

/**
 * `goals` — SMART goals per engagement.
 *
 * Phase 1.10. Each goal pairs a SMART statement with a measurable
 * target and a deadline. The Quality Gate (revenue_impact /
 * margin_impact) is mandatory — every goal must move top-line revenue,
 * protect margin, or both. Items that flag neither should be
 * questioned before publish.
 *
 * `target_metric` and `target_value` are free-text (e.g. "Q4 ARR" /
 * "$1.2M") — formal metric registry is deferred.
 */
export const goals = pgTable(
  "goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    targetMetric: text("target_metric"),
    targetValue: text("target_value"),
    targetDate: timestamp("target_date", { withTimezone: true }),
    status: goalStatusEnum("status").notNull().default("open"),
    revenueImpact: boolean("revenue_impact").notNull().default(false),
    marginImpact: boolean("margin_impact").notNull().default(false),
    ownerUserProfileId: uuid("owner_user_profile_id").references(
      () => userProfiles.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("goals_org_idx").on(t.orgId),
    engagementIdx: index("goals_engagement_idx").on(t.engagementId),
    ownerIdx: index("goals_owner_idx").on(t.ownerUserProfileId),
    statusIdx: index("goals_status_idx").on(t.status),
    targetDateIdx: index("goals_target_date_idx").on(t.targetDate),
  }),
);

/**
 * `soul_files` — long-form context document per engagement.
 *
 * Phase 1.7. Free-form markdown body, exactly one row per engagement
 * (UNIQUE constraint on engagement_id). The methodology calls this
 * the "Soul File" — the engagement's deep context: who the leadership
 * is, what they're trying to build, the strategic backdrop, the
 * business model nuances, hard-won learnings.
 *
 * Vector embeddings + pgvector semantic search are Phase 2 — added
 * here as a separate migration when there's enough Soul File content
 * across engagements to warrant cross-doc retrieval. For 1.7, lookup
 * is by engagement, so a vector column would be premature.
 *
 * `last_editor_user_profile_id` is the most-recent author (not the
 * creator). Useful for the "edited by … 3 days ago" footer.
 */
export const soulFiles = pgTable(
  "soul_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .unique()
      .references(() => engagements.id, { onDelete: "cascade" }),
    body: text("body").notNull().default(""),
    lastEditorUserProfileId: uuid(
      "last_editor_user_profile_id",
    ).references(() => userProfiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("soul_files_org_idx").on(t.orgId),
    engagementIdx: index("soul_files_engagement_idx").on(t.engagementId),
  }),
);

/**
 * Private per-user scratchpad in the client portal. One markdown note
 * per (engagement, user) — visible only to its owner (never the coach or
 * other client members). Stays editable even when the engagement is
 * paused; it's personal space, not engagement collaboration.
 */
export const portalNotes = pgTable(
  "portal_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    userProfileId: uuid("user_profile_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    body: text("body").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("portal_notes_org_idx").on(t.orgId),
    uniqueOwner: uniqueIndex("portal_notes_engagement_user_unique").on(
      t.engagementId,
      t.userProfileId,
    ),
  }),
);

/**
 * Claude-extracted Soul File insights — proposed additions Bruce can
 * Accept (merged into the Soul File body) or Dismiss. Originates from
 * BBS session notes / transcripts.
 */
export const soulFileAiInsights = pgTable(
  "soul_file_ai_insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    soulFileId: uuid("soul_file_id")
      .notNull()
      .references((): AnyPgColumn => soulFiles.id, { onDelete: "cascade" }),
    sourceSessionId: uuid("source_session_id").references(
      (): AnyPgColumn => bbsSessions.id,
      { onDelete: "set null" },
    ),
    body: text("body").notNull(),
    /** pending | accepted | dismissed */
    status: text("status").notNull().default("pending"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("soul_file_ai_insights_org_idx").on(t.orgId),
    soulIdx: index("soul_file_ai_insights_soul_idx").on(t.soulFileId),
  }),
);

/**
 * `bbs_sessions` — Business Building Sessions per engagement.
 *
 * Methodology: twice-monthly 2-hour sessions with each client (one
 * in-person, one virtual). Each row represents a single planned or
 * past session. Notes are markdown — the same renderer as messages.
 *
 * Phase 1.6 keeps the model tight:
 *   - `scheduled_at`     when the session happens (or happened).
 *   - `type`             in_person | virtual.
 *   - `status`           scheduled | completed | cancelled. "Missed" is
 *                        derived from (status=scheduled AND scheduled_at < now).
 *   - `notes`            markdown body, written before / during / after.
 *   - `fireflies_recording_id`  optional Fireflies meeting id once
 *                        the recording is in. The auto-extract pipeline
 *                        from the recording lives in Phase 1.7+.
 *
 * Recurring schedules, attendee tracking, and the "BBS prep" Live
 * Artifact view are deliberately out of scope for 1.6 — they're
 * higher-value once a real client engagement is running through The
 * Builder (Phase 1.7+).
 */
export const bbsSessions = pgTable(
  "bbs_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    type: bbsSessionTypeEnum("type").notNull(),
    status: bbsSessionStatusEnum("status").notNull().default("scheduled"),
    notes: text("notes"),
    firefliesRecordingId: text("fireflies_recording_id"),
    createdByUserProfileId: uuid("created_by_user_profile_id")
      .notNull()
      .references(() => userProfiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("bbs_sessions_org_idx").on(t.orgId),
    engagementIdx: index("bbs_sessions_engagement_idx").on(t.engagementId),
    scheduledAtIdx: index("bbs_sessions_scheduled_at_idx").on(t.scheduledAt),
    statusIdx: index("bbs_sessions_status_idx").on(t.status),
  }),
);

/**
 * `action_items` — owned, dated commitments per engagement.
 *
 * Created either by a Coach manually (status=open) or by Claude from a
 * Fireflies transcript (status=draft, confidence_flag set, fireflies_
 * transcript_id populated). Drafts are visible only to coaches;
 * publishing a draft transitions status from draft → open and surfaces
 * the item in the assignee's portal.
 *
 * Quality Gate: every item flags whether it moves top-line revenue,
 * margin, or both. Items that flag neither should be questioned before
 * publish.
 */
export const actionItems = pgTable(
  "action_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    /** Optional link to the project this action item is part of.
     *  Null means it's a one-off commitment (not tied to a specific
     *  project body of work). Drives the Workspace tab's grouping. */
    projectId: uuid("project_id").references(
      (): AnyPgColumn => projects.id,
      { onDelete: "set null" },
    ),
    title: text("title").notNull(),
    description: text("description"),
    status: actionItemStatusEnum("status").notNull().default("open"),
    assigneeUserProfileId: uuid("assignee_user_profile_id").references(
      () => userProfiles.id,
      { onDelete: "set null" },
    ),
    dueDate: timestamp("due_date", { withTimezone: true }),
    revenueImpact: boolean("revenue_impact").notNull().default(false),
    marginImpact: boolean("margin_impact").notNull().default(false),
    firefliesTranscriptId: text("fireflies_transcript_id"),
    /** BB-#### id of the matching row in the EA Action Items sheet
     *  (Command Central). Set when this item is pushed to the EA gateway;
     *  null until pushed. Drives the two-way sync. */
    eaExternalId: text("ea_external_id"),
    bbsSessionId: uuid("bbs_session_id").references(
      (): AnyPgColumn => bbsSessions.id,
      { onDelete: "set null" },
    ),
    confidenceFlag: confidenceFlagEnum("confidence_flag"),
    createdBy: actionItemCreatedByEnum("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("action_items_org_idx").on(t.orgId),
    engagementIdx: index("action_items_engagement_idx").on(t.engagementId),
    assigneeIdx: index("action_items_assignee_idx").on(t.assigneeUserProfileId),
    statusIdx: index("action_items_status_idx").on(t.status),
    projectIdx: index("action_items_project_idx").on(t.projectId),
    eaExternalIdx: index("action_items_ea_external_id_idx").on(t.eaExternalId),
  })
);

/**
 * `messages` — contextual conversations.
 *
 * Threaded messages tied to a parent entity via the (parent_entity_type,
 * parent_entity_id) pair. `parent_entity_type` is text rather than an
 * enum so new entity types (deliverables, projects, hires) can attach
 * threads without a schema migration; the application layer validates.
 *
 * `engagement_id` is denormalized so "all messages in this engagement"
 * (the Recent Activity view) is a single index hit instead of a join
 * through the parent entity.
 *
 * `mentions` is a JSONB array of user_profile UUIDs parsed from @mentions
 * in `body`; Phase 1.4 reads it to fan out notifications.
 */
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    parentEntityType: text("parent_entity_type").notNull(),
    parentEntityId: uuid("parent_entity_id").notNull(),
    body: text("body").notNull(),
    authorUserProfileId: uuid("author_user_profile_id")
      .notNull()
      .references(() => userProfiles.id),
    mentions: jsonb("mentions").notNull().default(sql`'[]'::jsonb`),
    parentMessageId: uuid("parent_message_id").references(
      (): AnyPgColumn => messages.id,
      { onDelete: "set null" },
    ),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("messages_org_idx").on(t.orgId),
    engagementIdx: index("messages_engagement_idx").on(t.engagementId),
    parentIdx: index("messages_parent_idx").on(
      t.parentEntityType,
      t.parentEntityId,
    ),
    authorIdx: index("messages_author_idx").on(t.authorUserProfileId),
  })
);

/**
 * `message_reactions` — emoji reactions on a message.
 *
 * One row per (message, user, emoji). Composite primary key
 * (message_id, user_profile_id, emoji) prevents duplicate reactions —
 * a user can react to a message with multiple distinct emojis but only
 * once per emoji. Toggling off is a DELETE; no soft-delete here, no
 * audit need.
 *
 * `org_id` denormalized for RLS (same pattern as `document_tags`):
 * filtering by org_id is a direct index hit and the RLS predicate
 * stays the simple `org_id = auth.org_id()`. Application code copies
 * org_id from the parent message at insert time.
 *
 * `emoji` stores the unicode glyph itself (e.g. "👍", "❤️"). Skin-tone
 * variants are kept distinct (different glyph, different row).
 */
export const messageReactions = pgTable(
  "message_reactions",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userProfileId: uuid("user_profile_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({
      columns: [t.messageId, t.userProfileId, t.emoji],
    }),
    orgIdx: index("message_reactions_org_idx").on(t.orgId),
    messageIdx: index("message_reactions_message_idx").on(t.messageId),
    userIdx: index("message_reactions_user_idx").on(t.userProfileId),
  }),
);

/**
 * `documents` — files uploaded per engagement.
 *
 * Storage backend: Netlify Blobs (Phase 1.5). `blob_key` is the stable
 * key under which the file lives in the Blobs store; the engagement's
 * `org_id` namespace is encoded into the key. `original_filename`
 * preserves the user-supplied name for display and download; `file_type`
 * is the MIME type.
 */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id").references(() => engagements.id, {
      onDelete: "cascade",
    }),
    // A document can instead (or also) belong to a prospect/lead — e.g. the
    // PDF The Climb generates — so it stays on file whether or not they
    // convert. Nullable; engagement documents leave it null.
    prospectId: uuid("prospect_id").references((): AnyPgColumn => prospects.id, {
      onDelete: "cascade",
    }),
    blobKey: text("blob_key").notNull().unique(),
    originalFilename: text("original_filename").notNull(),
    fileType: text("file_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    uploaderUserProfileId: uuid("uploader_user_profile_id").references(
      () => userProfiles.id,
    ),
    version: bigint("version", { mode: "number" }).notNull().default(1),
    // When this engagement has a managed Drive folder, app uploads are
    // mirrored into Drive and the resulting file is recorded here.
    googleDriveFileId: text("google_drive_file_id"),
    googleDriveWebLink: text("google_drive_web_link"),
    parentDocumentId: uuid("parent_document_id").references(
      (): AnyPgColumn => documents.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("documents_org_idx").on(t.orgId),
    engagementIdx: index("documents_engagement_idx").on(t.engagementId),
    uploaderIdx: index("documents_uploader_idx").on(t.uploaderUserProfileId),
  })
);

/**
 * `message_attachments` — join table linking messages to documents.
 *
 * Phase 1.5. Uploading a file via the message composer's paperclip
 * persists it to the `documents` table (so it also shows up on the
 * engagement's Documents page) and creates one row here pointing the
 * message at it. A document can be attached to multiple messages
 * (rare, but free); a single message can carry many attachments.
 *
 * Composite PK (message_id, document_id) prevents duplicate attaches.
 * `org_id` denormalized for RLS — same pattern as `document_tags`,
 * `message_reactions`. App code copies it from the parent message at
 * insert time.
 */
export const messageAttachments = pgTable(
  "message_attachments",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.messageId, t.documentId] }),
    orgIdx: index("message_attachments_org_idx").on(t.orgId),
    messageIdx: index("message_attachments_message_idx").on(t.messageId),
    documentIdx: index("message_attachments_document_idx").on(t.documentId),
  }),
);

/**
 * `document_tags` — many-to-many of free-text tags on documents.
 *
 * Composite primary key (document_id, tag) — a document can carry many
 * tags, each unique within that document. `org_id` is denormalized for
 * RLS efficiency: filtering by org_id is a direct index hit instead of
 * a join through documents. Application code copies org_id from the
 * parent document at insert time; consistency is enforced at the
 * application boundary, not by a CHECK constraint, for Phase 1 simplicity.
 *
 * Free-text tags now; controlled vocabulary is a Phase 2 concern.
 */
export const documentTags = pgTable(
  "document_tags",
  {
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.documentId, t.tag] }),
    orgIdx: index("document_tags_org_idx").on(t.orgId),
    tagIdx: index("document_tags_tag_idx").on(t.tag),
  })
);

/**
 * `notifications` — in-app and email notification records.
 *
 * One row per recipient per event. `parent_entity_type` + `parent_
 * entity_id` point at whatever the notification is about (a message
 * for @mentions, an action_item for assignments and due-soon nudges).
 * `read_at` null means unread. `sent_via` records how the notification
 * was delivered ('email', 'in_app', 'both').
 *
 * Notification body text is rendered at display time from the parent
 * entity rather than snapshotted here — Phase 2 may add a snapshot
 * column once we have a real reason to denormalize.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    userProfileId: uuid("user_profile_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull(),
    parentEntityType: text("parent_entity_type").notNull(),
    parentEntityId: uuid("parent_entity_id").notNull(),
    sentVia: notificationSentViaEnum("sent_via").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("notifications_org_idx").on(t.orgId),
    userProfileIdx: index("notifications_user_profile_idx").on(
      t.userProfileId,
    ),
    unreadIdx: index("notifications_unread_idx").on(
      t.userProfileId,
      t.readAt,
    ),
  })
);

/**
 * Web Push subscriptions — one row per browser/device a Business Builder
 * has enabled desktop notifications on. The server sends a push to every
 * subscription for a user when a notification fires, so a pop-up reaches
 * them with the tab closed.
 */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    userProfileId: uuid("user_profile_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    endpointUniq: uniqueIndex("push_subscriptions_endpoint_uniq").on(
      t.endpoint,
    ),
    userIdx: index("push_subscriptions_user_idx").on(t.userProfileId),
  }),
);

export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;

// ---------- Phase 1.16: Forms ----------

/**
 * `forms` — diagnostic / intake / pulse / NPS / custom forms.
 *
 * Schema is JSONB — an array of question definitions. Submission
 * answers are likewise JSONB. Phase 1.16 ships a minimal structure
 * (text / textarea / radio / scale / checkbox question types) and
 * a public-facing token URL so prospects can fill diagnostics
 * without a Clerk account. Token-only access path lands in Phase 2;
 * for 1.16 forms are filled by authenticated users only.
 */
export const forms = pgTable(
  "forms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    type: formTypeEnum("type").notNull(),
    schema: jsonb("schema").notNull().default(sql`'[]'::jsonb`),
    isActive: boolean("is_active").notNull().default(true),
    publicToken: text("public_token").unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("forms_org_idx").on(t.orgId),
    engagementIdx: index("forms_engagement_idx").on(t.engagementId),
    typeIdx: index("forms_type_idx").on(t.type),
  }),
);

export const formSubmissions = pgTable(
  "form_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    formId: uuid("form_id")
      .notNull()
      .references(() => forms.id, { onDelete: "cascade" }),
    submittedByUserProfileId: uuid("submitted_by_user_profile_id").references(
      () => userProfiles.id,
      { onDelete: "set null" },
    ),
    respondentName: text("respondent_name"),
    respondentEmail: text("respondent_email"),
    answers: jsonb("answers").notNull().default(sql`'{}'::jsonb`),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("form_submissions_org_idx").on(t.orgId),
    formIdx: index("form_submissions_form_idx").on(t.formId),
  }),
);

// ---------- Phase 1.17: Deliverables ----------

/**
 * `deliverables` — one of the 9 methodology-defined deliverable
 * types per engagement. Generated content lives on a linked
 * document; the row tracks lifecycle status.
 */
export const deliverables = pgTable(
  "deliverables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    type: deliverableTypeEnum("type").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    status: deliverableStatusEnum("status").notNull().default("not_started"),
    documentId: uuid("document_id").references(() => documents.id, {
      onDelete: "set null",
    }),
    /** Planning target for when this deliverable should ship. Optional
     *  — set when the deliverable is queued. Used by the engagement
     *  Gantt to plot the deliverable as a milestone diamond ahead of
     *  delivery. Once delivered_at is set, that timestamp is preferred
     *  for the milestone position. */
    targetDate: timestamp("target_date", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    /** Who marked this delivered (coach or client). Shown to both sides
     *  alongside the delivered date. */
    completedByUserProfileId: uuid("completed_by_user_profile_id").references(
      () => userProfiles.id,
      { onDelete: "set null" },
    ),
    revenueImpact: boolean("revenue_impact").notNull().default(false),
    marginImpact: boolean("margin_impact").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("deliverables_org_idx").on(t.orgId),
    engagementIdx: index("deliverables_engagement_idx").on(t.engagementId),
    typeIdx: index("deliverables_type_idx").on(t.type),
    statusIdx: index("deliverables_status_idx").on(t.status),
    targetDateIdx: index("deliverables_target_date_idx").on(t.targetDate),
  }),
);

// ---------- Phase 1.18: Invoices + Subscriptions + Embedded Apps ----------

/**
 * `qbo_oauth_tokens` — per-Coach OAuth refresh tokens for QuickBooks
 * Online. Same shape as the (now-removed) adobe_sign_oauth_tokens
 * table. `realm_id` is QBO's identifier for the company file (Bruce's
 * company file vs. a partner Coach's, in the multi-Coach future).
 */
export const qboOauthTokens = pgTable(
  "qbo_oauth_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    coachUserProfileId: uuid("coach_user_profile_id")
      .notNull()
      .unique()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token").notNull(),
    realmId: text("realm_id").notNull(),
    companyName: text("company_name"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    refreshExpiresAt: timestamp("refresh_expires_at", {
      withTimezone: true,
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    coachIdx: index("qbo_oauth_tokens_coach_idx").on(t.coachUserProfileId),
  }),
);

/**
 * `google_calendar_tokens` — per-user Google OAuth tokens (Phase 5,
 * migration 0022). Stored encrypted via lib/crypto/secret-vault.
 * Used by the BBS-session ↔ Google Calendar two-way sync.
 */
export const googleCalendarTokens = pgTable(
  "google_calendar_tokens",
  {
    userProfileId: uuid("user_profile_id")
      .primaryKey()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
    accessTokenEncrypted: text("access_token_encrypted"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope").notNull(),
    calendarId: text("calendar_id").notNull().default("primary"),
    googleEmail: text("google_email"),
    // Where app-managed client folders get moved when their client is
    // archived (per-coach "Archive" folder, a Drive folder id).
    driveArchiveFolderId: text("drive_archive_folder_id"),
    // Gmail sync state (migration 0024). Disabled => no Gmail polling for
    // this user. lastSyncedAt = wall-clock time we last ran sync; lastMessageAt
    // = internalDate of the newest message captured (used as next-sync floor).
    gmailSyncEnabled: boolean("gmail_sync_enabled").notNull().default(true),
    gmailLastSyncedAt: timestamp("gmail_last_synced_at", { withTimezone: true }),
    gmailLastMessageAt: timestamp("gmail_last_message_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("google_calendar_tokens_org_idx").on(t.orgId),
  }),
);

/**
 * `google_calendar_event_mappings` — links each BBS session to the
 * Google Calendar event(s) created for it, one row per (session, user).
 * Lets us PATCH / DELETE the right Google event when a session moves.
 */
export const googleCalendarEventMappings = pgTable(
  "google_calendar_event_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    bbsSessionId: uuid("bbs_session_id")
      .notNull()
      .references(() => bbsSessions.id, { onDelete: "cascade" }),
    userProfileId: uuid("user_profile_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    googleEventId: text("google_event_id").notNull(),
    googleCalendarId: text("google_calendar_id").notNull(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("google_calendar_event_mappings_org_idx").on(t.orgId),
    sessionIdx: index("google_calendar_event_mappings_session_idx").on(
      t.bbsSessionId,
    ),
    uniqByUser: uniqueIndex("google_calendar_event_mappings_uniq").on(
      t.bbsSessionId,
      t.userProfileId,
    ),
  }),
);

/**
 * Client communications log (Phase 5, migration 0023).
 *
 * Unified audit trail of every external touchpoint with a client —
 * email, SMS, WhatsApp, phone calls, meeting notes. Replaces the
 * "we tracked it in 4 different places" problem.
 *
 * Attaches to EITHER a prospect (pre-engagement) or an engagement
 * (post-engagement) but never both. A CHECK constraint enforces this
 * at the database layer.
 */
export const communicationChannelEnum = pgEnum("communication_channel", [
  "email",
  "sms",
  "whatsapp",
  "phone_call",
  "meeting_note",
  "other",
]);

export const communicationDirectionEnum = pgEnum("communication_direction", [
  "inbound",
  "outbound",
]);

export const clientCommunications = pgTable(
  "client_communications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    prospectId: uuid("prospect_id").references(
      (): AnyPgColumn => prospects.id,
      { onDelete: "cascade" },
    ),
    engagementId: uuid("engagement_id").references(() => engagements.id, {
      onDelete: "cascade",
    }),
    channel: communicationChannelEnum("channel").notNull(),
    direction: communicationDirectionEnum("direction").notNull(),
    fromAddress: text("from_address"),
    toAddresses: text("to_addresses")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    subject: text("subject"),
    body: text("body").notNull().default(""),
    bodyHtml: text("body_html"),
    threadKey: text("thread_key"),
    externalId: text("external_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    createdByUserProfileId: uuid("created_by_user_profile_id").references(
      () => userProfiles.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("client_communications_org_idx").on(t.orgId),
    prospectIdx: index("client_communications_prospect_idx").on(t.prospectId),
    engagementIdx: index("client_communications_engagement_idx").on(
      t.engagementId,
    ),
    occurredIdx: index("client_communications_occurred_idx").on(t.occurredAt),
  }),
);

/**
 * Reusable email templates Bruce builds once, sends to many. Subject
 * and body support `{{variable}}` interpolation against the prospect
 * or engagement context at send time (e.g. {{contact_name}},
 * {{company_name}}, {{sender_name}}).
 */
export const emailTemplates = pgTable(
  "email_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category").notNull().default("other"),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    createdByUserProfileId: uuid("created_by_user_profile_id").references(
      () => userProfiles.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("email_templates_org_idx").on(t.orgId),
    categoryIdx: index("email_templates_category_idx").on(t.orgId, t.category),
  }),
);

/**
 * Document templates — body content for the native signing flow.
 * Used when Bruce wants to compose the document (contract, NDA,
 * proposal, renewal) inside The Builder rather than upload a PDF
 * from elsewhere. Body is markdown with `{{variable}}` placeholders
 * resolved at compose time from the prospect / engagement / sender.
 */
export const documentTemplates = pgTable(
  "document_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** contract | proposal | nda | renewal | other */
    category: text("category").notNull().default("other"),
    bodyMarkdown: text("body_markdown").notNull().default(""),
    defaultSubject: text("default_subject"),
    createdByUserProfileId: uuid("created_by_user_profile_id").references(
      () => userProfiles.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("document_templates_org_idx").on(t.orgId),
    categoryIdx: index("document_templates_category_idx").on(t.orgId, t.category),
  }),
);

export type DocumentTemplate = typeof documentTemplates.$inferSelect;
export type NewDocumentTemplate = typeof documentTemplates.$inferInsert;

/**
 * Per-prospect / per-engagement BCC alias. Bruce BCCs the alias on any
 * outbound email; the inbound webhook resolves it back to the right
 * client record.
 */
export const communicationAliases = pgTable(
  "communication_aliases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    alias: text("alias").notNull().unique(),
    prospectId: uuid("prospect_id").references((): AnyPgColumn => prospects.id, {
      onDelete: "cascade",
    }),
    engagementId: uuid("engagement_id").references(() => engagements.id, {
      onDelete: "cascade",
    }),
    createdByUserProfileId: uuid("created_by_user_profile_id").references(
      () => userProfiles.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("communication_aliases_org_idx").on(t.orgId),
    prospectIdx: index("communication_aliases_prospect_idx").on(t.prospectId),
    engagementIdx: index("communication_aliases_engagement_idx").on(
      t.engagementId,
    ),
  }),
);

/**
 * `embedded_apps` — Netlify projects surfaced as portal modules.
 *
 * Coach configures: pick a Netlify project, name it for the client,
 * choose auth mode. The Builder renders an iframe widget on the
 * portal pointing at the project's URL. Phase 1.18 supports the
 * `public` and `token_passthrough` auth modes; `clerk_sso` lands
 * in Phase 2 once the SSO bridge is wired.
 */
export const embeddedApps = pgTable(
  "embedded_apps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    netlifyProjectId: text("netlify_project_id").notNull(),
    displayName: text("display_name").notNull(),
    description: text("description"),
    /** Markdown how-to: using the tool + adding it to a browser/desktop
     *  (bookmark, PWA install, etc.). Shown to clients in the portal. */
    instructions: text("instructions"),
    appUrl: text("app_url").notNull(),
    authMode: embeddedAppAuthModeEnum("auth_mode")
      .notNull()
      .default("public"),
    isVisible: boolean("is_visible").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("embedded_apps_org_idx").on(t.orgId),
    engagementIdx: index("embedded_apps_engagement_idx").on(t.engagementId),
  }),
);

/** Per-user "favourite" flag on an embedded app, so clients can pin the
 *  tools they reach for. One row per (app, user). */
export const embeddedAppFavourites = pgTable(
  "embedded_app_favourites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    embeddedAppId: uuid("embedded_app_id")
      .notNull()
      .references(() => embeddedApps.id, { onDelete: "cascade" }),
    userProfileId: uuid("user_profile_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("embedded_app_favourites_org_idx").on(t.orgId),
    uniqueFav: uniqueIndex("embedded_app_favourites_unique").on(
      t.embeddedAppId,
      t.userProfileId,
    ),
  }),
);

// ---------- Phase 1.19: Courses (LMS) ----------

/**
 * `courses` — programs (LMDS, ELS, etc.) delivered through The
 * Builder's native LMS. Either self-paced (one user at a time
 * works through lessons) or cohort (group moves together).
 */
export const courses = pgTable(
  "courses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    deliveryMode: courseDeliveryModeEnum("delivery_mode").notNull(),
    isPublished: boolean("is_published").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("courses_org_idx").on(t.orgId),
    engagementIdx: index("courses_engagement_idx").on(t.engagementId),
  }),
);

export const lessons = pgTable(
  "lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body"), // markdown
    orderIndex: bigint("order_index", { mode: "number" })
      .notNull()
      .default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("lessons_org_idx").on(t.orgId),
    courseIdx: index("lessons_course_idx").on(t.courseId),
  }),
);

export const cohorts = pgTable(
  "cohorts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: cohortStatusEnum("status").notNull().default("upcoming"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("cohorts_org_idx").on(t.orgId),
    courseIdx: index("cohorts_course_idx").on(t.courseId),
  }),
);

export const enrollments = pgTable(
  "enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    cohortId: uuid("cohort_id").references(() => cohorts.id, {
      onDelete: "set null",
    }),
    userProfileId: uuid("user_profile_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    status: enrollmentStatusEnum("status").notNull().default("enrolled"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("enrollments_org_idx").on(t.orgId),
    courseIdx: index("enrollments_course_idx").on(t.courseId),
    cohortIdx: index("enrollments_cohort_idx").on(t.cohortId),
    userIdx: index("enrollments_user_idx").on(t.userProfileId),
  }),
);

/**
 * `soul_file_chunks` — chunked embeddings for Soul Files. Phase 4.
 *
 * Each row is one ~1500-char chunk of a Soul File body, with its own
 * embedding. Replaces the document-level embedding for retrieval
 * accuracy without removing it (the top-level `soul_files.embedding`
 * column is still used for "most relevant whole document" queries).
 *
 * Vector column intentionally omitted from the Drizzle definition —
 * pgvector isn't a first-class Drizzle type. We read/write via raw
 * SQL through tx.execute. Drizzle still helps with the structural
 * columns.
 */
export const soulFileChunks = pgTable(
  "soul_file_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    soulFileId: uuid("soul_file_id")
      .notNull()
      .references((): AnyPgColumn => soulFiles.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    chunkIndex: bigint("chunk_index", { mode: "number" }).notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("soul_file_chunks_org_idx").on(t.orgId),
    soulFileIdx: index("soul_file_chunks_soul_file_idx").on(
      t.soulFileId,
      t.chunkIndex,
    ),
  }),
);

/**
 * `lesson_completions` — per-user lesson progress for the LMS. Phase 4.
 * One row per (lesson, user) once the user marks the lesson done.
 * Course progress = COUNT(completions) / COUNT(lessons in course).
 */
export const lessonCompletions = pgTable(
  "lesson_completions",
  {
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    userProfileId: uuid("user_profile_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    completedAt: timestamp("completed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.lessonId, t.userProfileId] }),
    orgIdx: index("lesson_completions_org_idx").on(t.orgId),
    userIdx: index("lesson_completions_user_idx").on(t.userProfileId),
  }),
);

// ---------- Phase 3 tables ----------

/**
 * `portal_module_assignments` — which modules a given engagement has
 * enabled. Per CLAUDE.md the portal is a configurable canvas; this
 * table makes that real.
 *
 * Default behaviour: if no row exists for a given (engagement, module)
 * pair, that module is ENABLED (the all-on baseline). Adding a row
 * with `is_enabled=false` hides it. Phase 3 keeps the row-or-no-row
 * model so existing engagements keep working without migration.
 */
export const portalModuleAssignments = pgTable(
  "portal_module_assignments",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    module: portalModuleEnum("module").notNull(),
    isEnabled: boolean("is_enabled").notNull().default(true),
    sortOrder: bigint("sort_order", { mode: "number" })
      .notNull()
      .default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.engagementId, t.module] }),
    orgIdx: index("portal_module_assignments_org_idx").on(t.orgId),
    engagementIdx: index("portal_module_assignments_engagement_idx").on(
      t.engagementId,
    ),
  }),
);

/**
 * `prospects` — pre-engagement contacts. The diagnostic intake form
 * (CLAUDE.md "Native diagnostic form; submission auto-creates a
 * Prospect record") writes here when filled by an unauthenticated
 * visitor. Coach reviews, generates proposal, signs contract; when
 * the contract signs, the prospect gets converted into a real
 * engagement and the row marked `onboarded`.
 *
 * Tenant: lives in the master org. The diagnostic_form_submission_id
 * (when present) points back at the form_submission for traceability.
 */
export const prospects = pgTable(
  "prospects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    companyName: text("company_name").notNull(),
    contactName: text("contact_name"),
    contactEmail: text("contact_email").notNull(),
    phone: text("phone"),
    companyWebsite: text("company_website"),
    /** Social handles — LinkedIn is the one Bruce names; Facebook /
     *  Instagram cover the trades world. Stored as full URLs. */
    linkedinUrl: text("linkedin_url"),
    facebookUrl: text("facebook_url"),
    instagramUrl: text("instagram_url"),
    industry: text("industry"),
    /** Free-text, human-facing source label (LEAD_SOURCES). Retained for
     *  display + the referral gift-cert rule. NOT the attribution key —
     *  see `source` below. */
    leadSource: text("lead_source"),
    /** Canonical acquisition channel — first-touch, never overwritten,
     *  NOT NULL and no DB default, so every insert path MUST set it
     *  (compile-time via $inferInsert, runtime via the NOT NULL constraint). */
    source: leadSourceChannelEnum("source").notNull(),
    /** Granular provenance the channel can't hold: utm_campaign, which
     *  podcast, the referrer's context. Nullable. */
    sourceDetail: text("source_detail"),
    /** First time this prospect reached us (first-touch). Backfilled from
     *  created_at; set once, never moved. */
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }),
    /** When they first booked a session. Drives the report's "Booked
     *  sessions" column. Set once. */
    bookedSessionAt: timestamp("booked_session_at", { withTimezone: true }),
    /** When they became a paying client (onboarded). Drives the "Clients"
     *  column. Set once. */
    becameClientAt: timestamp("became_client_at", { withTimezone: true }),
    /** Who referred this prospect — required when leadSource = "Referral".
     *  On conversion to an active engagement, drives the $50 gift-cert /
     *  thank-you-card reminder. */
    referrerName: text("referrer_name"),
    expectedValueCents: bigint("expected_value_cents", { mode: "number" }),
    currency: text("currency").notNull().default("CAD"),
    /** Which program they're being slotted into. Captured on the
     *  prospect (not the engagement) so the BBA + contract flows
     *  pull from a single source of truth. Optional — set as the
     *  deal qualifies, e.g. after the diagnostic call. */
    programType: text("program_type"), // "accelerator" | "implementer" | null
    /** Pricing tier key (matches `pricing_tiers.tier_key`) — drives
     *  the suggested fee. Editable per-deal. */
    pricingTier: text("pricing_tier"),
    /** Monthly fee for the engagement, in cents. Set when the deal
     *  firms up; auto-fills the {{monthly_fee}} placeholder in the
     *  contract. */
    monthlyFeeCents: bigint("monthly_fee_cents", { mode: "number" }),
    /** When the engagement is expected to begin. Used by the BBA's
     *  {{start_date}} variable. Becomes the engagement.start_date
     *  when the prospect converts. */
    expectedStartDate: timestamp("expected_start_date", { withTimezone: true }),
    nextActionDate: timestamp("next_action_date", { withTimezone: false }),
    nextActionNote: text("next_action_note"),
    nextActionLocation: text("next_action_location"),
    lastContactAt: timestamp("last_contact_at", { withTimezone: true }),
    ownerUserProfileId: uuid("owner_user_profile_id").references(
      () => userProfiles.id,
      { onDelete: "set null" },
    ),
    status: prospectStatusEnum("status").notNull().default("new_lead"),
    diagnosticSubmissionId: uuid(
      "diagnostic_submission_id",
    ).references(() => formSubmissions.id, { onDelete: "set null" }),
    convertedEngagementId: uuid("converted_engagement_id").references(
      () => engagements.id,
      { onDelete: "set null" },
    ),
    notes: text("notes"),
    /** Link to this client's QuickBooks customer, set via the "Link
     *  QuickBooks customer" picker on the prospect detail page. Drives
     *  the pipeline "Value" column — qbo_lifetime_payments_cents is the
     *  cached total payments received, refreshed by qbo-value-sync. */
    qboCustomerId: text("qbo_customer_id"),
    qboCustomerName: text("qbo_customer_name"),
    qboRealmId: text("qbo_realm_id"),
    qboLifetimePaymentsCents: bigint("qbo_lifetime_payments_cents", {
      mode: "number",
    }),
    qboValueSyncedAt: timestamp("qbo_value_synced_at", { withTimezone: true }),
    /** When the QuickBooks customer link was first established (vs the
     *  value-sync timestamp above). Stamped on link, cleared on unlink. */
    qboLinkedAt: timestamp("qbo_linked_at", { withTimezone: true }),
    /** Soft-delete. When set, the prospect is archived — hidden from the
     *  default pipeline but recoverable (no data loss). Replaces hard
     *  delete for the Delete buttons. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    /** When the contract was signed — set when status moves to
     *  contract_signed. Drives the "Date signed" sort on the pipeline. */
    contractSignedAt: timestamp("contract_signed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("prospects_org_idx").on(t.orgId),
    statusIdx: index("prospects_status_idx").on(t.status),
    emailIdx: index("prospects_email_idx").on(t.contactEmail),
    ownerIdx: index("prospects_owner_idx").on(t.ownerUserProfileId),
    nextActionIdx: index("prospects_next_action_idx").on(t.nextActionDate),
  }),
);

/**
 * `prospect_activities` — per-prospect timeline of calls, emails,
 * meetings, notes, stage changes. Anything that belongs on the
 * activity log. `type` is a free-text discriminator so we can add
 * new activity types without a migration (call / email / meeting /
 * note / stage_change / web_lead / signature_request).
 */
export const prospectActivities = pgTable(
  "prospect_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    prospectId: uuid("prospect_id")
      .notNull()
      .references((): AnyPgColumn => prospects.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    subject: text("subject"),
    body: text("body"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdByUserProfileId: uuid("created_by_user_profile_id").references(
      () => userProfiles.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    prospectIdx: index("prospect_activities_prospect_idx").on(
      t.prospectId,
      t.occurredAt,
    ),
    orgIdx: index("prospect_activities_org_idx").on(t.orgId),
  }),
);

/**
 * `prospect_comments` — internal Business Builder discussion on a
 * prospect / client. Private to the practice (master_admin + coach);
 * never surfaced in the client portal. Distinct from
 * `prospect_activities` (a factual touchpoint log) — this is a
 * conversation thread so Bruce, Jen, and future Business Builders can
 * talk about a lead. Authors can @notify teammates, who receive an
 * in-app notification + an email.
 */
export const prospectComments = pgTable(
  "prospect_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    prospectId: uuid("prospect_id")
      .notNull()
      .references((): AnyPgColumn => prospects.id, { onDelete: "cascade" }),
    authorUserProfileId: uuid("author_user_profile_id").references(
      () => userProfiles.id,
      { onDelete: "set null" },
    ),
    body: text("body").notNull(),
    notifiedUserProfileIds: jsonb("notified_user_profile_ids")
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    prospectIdx: index("prospect_comments_prospect_idx").on(
      t.prospectId,
      t.createdAt,
    ),
    orgIdx: index("prospect_comments_org_idx").on(t.orgId),
  }),
);

/**
 * `person_profiles` — TTI TriMetrix HD assessment per individual.
 * Per CLAUDE.md domain model, this is a first-class entity. Each row
 * captures the gap report PDF + extracted summary + raw scores
 * (internal-only — not visible in client portal per IP exposure rules).
 */
export const personProfiles = pgTable(
  "person_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    userProfileId: uuid("user_profile_id").references(() => userProfiles.id, {
      onDelete: "set null",
    }),
    fullName: text("full_name").notNull(),
    role: text("role"),
    source: personProfileSourceEnum("source").notNull().default("tti_trimetrix_hd"),
    assessmentDate: timestamp("assessment_date", { withTimezone: true }),
    summary: text("summary"),
    /** Raw DISC, driving forces, competency scores. JSONB so we can
     * accept whatever shape TTI emits and shape it later. Internal
     * only — never returned to the client portal. */
    rawScores: jsonb("raw_scores").notNull().default(sql`'{}'::jsonb`),
    documentId: uuid("document_id").references(() => documents.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("person_profiles_org_idx").on(t.orgId),
    engagementIdx: index("person_profiles_engagement_idx").on(t.engagementId),
    userIdx: index("person_profiles_user_idx").on(t.userProfileId),
  }),
);

/**
 * `scheduling_links` — Calendly-style booking links. Each row defines
 * a per-Coach link with a slug, meeting duration, availability rules,
 * and a target meeting type (discovery → creates a prospect; bbs →
 * creates a bbs_session row).
 *
 * Phase 3.8: minimal viable booking. Google Calendar sync, conflict
 * resolution, and AI auto-scheduling are Phase 4+.
 */
export const schedulingLinks = pgTable(
  "scheduling_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    coachUserProfileId: uuid("coach_user_profile_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    meetingType: schedulingMeetingTypeEnum("meeting_type")
      .notNull()
      .default("discovery"),
    durationMinutes: bigint("duration_minutes", { mode: "number" })
      .notNull()
      .default(30),
    /** Availability rules: { weekdays: [1..5], startMinute: 510, endMinute: 1080 }
     * (Mon–Fri, 8:30am–6:00pm Mountain Time by default). Stored as
     * JSONB so we can iterate without a schema migration. */
    availability: jsonb("availability").notNull().default(sql`'{}'::jsonb`),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("scheduling_links_org_idx").on(t.orgId),
    coachIdx: index("scheduling_links_coach_idx").on(t.coachUserProfileId),
  }),
);

/**
 * `bookings` — actual booked time slots. Created when a public
 * visitor (or authenticated user) books via a scheduling_link.
 * Bookings against a `bbs` link auto-create a bbs_session row;
 * `discovery` links auto-create a prospect.
 */
export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    schedulingLinkId: uuid("scheduling_link_id")
      .notNull()
      .references(() => schedulingLinks.id, { onDelete: "cascade" }),
    bookedAt: timestamp("booked_at", { withTimezone: true }).notNull(),
    durationMinutes: bigint("duration_minutes", { mode: "number" }).notNull(),
    bookerName: text("booker_name").notNull(),
    bookerEmail: text("booker_email").notNull(),
    bookerCompany: text("booker_company"),
    notes: text("notes"),
    bbsSessionId: uuid("bbs_session_id").references(() => bbsSessions.id, {
      onDelete: "set null",
    }),
    prospectId: uuid("prospect_id").references((): AnyPgColumn => prospects.id, {
      onDelete: "set null",
    }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("bookings_org_idx").on(t.orgId),
    linkIdx: index("bookings_link_idx").on(t.schedulingLinkId),
    bookedAtIdx: index("bookings_booked_at_idx").on(t.bookedAt),
  }),
);

/**
 * `channel_spend` — hand-entered marketing spend, one row per channel per
 * month. No ad-platform API: Bruce types in what he spent. Powers the
 * cost-per-booked-session and cost-per-client columns of the lead-source
 * attribution report. Channels with no row show a dash for cost columns.
 * Master-org only (accessed via withSystemContext), RLS on org_id.
 */
export const channelSpend = pgTable(
  "channel_spend",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    channel: leadSourceChannelEnum("channel").notNull(),
    /** First day of the month the spend applies to (always day 01). */
    month: date("month").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgChannelMonthUniq: uniqueIndex("channel_spend_org_channel_month_uniq").on(
      t.orgId,
      t.channel,
      t.month,
    ),
  }),
);
export type ChannelSpend = typeof channelSpend.$inferSelect;
export type NewChannelSpend = typeof channelSpend.$inferInsert;

/**
 * `signature_envelopes` — Phase 4.5 native e-signing.
 *
 * Replaces the Adobe Sign integration. Each envelope contains one
 * source document (the contract / NDA / SOW) and one or more signers.
 * Sequential routing: signer at order_index=0 signs first, then 1, etc.
 *
 * `audit_log` is append-only JSON capturing every state transition
 * with timestamp + actor for the certificate-of-completion page.
 *
 * On completion, `signed_document_id` points at a new `documents`
 * row holding the original PDF + a certificate page.
 */
export const signatureEnvelopes = pgTable(
  "signature_envelopes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    prospectId: uuid("prospect_id").references(
      (): AnyPgColumn => prospects.id,
      { onDelete: "set null" },
    ),
    engagementId: uuid("engagement_id").references(() => engagements.id, {
      onDelete: "set null",
    }),
    sourceDocumentId: uuid("source_document_id")
      .notNull()
      .references((): AnyPgColumn => documents.id, { onDelete: "restrict" }),
    signedDocumentId: uuid("signed_document_id").references(
      (): AnyPgColumn => documents.id,
      { onDelete: "set null" },
    ),
    subject: text("subject").notNull(),
    message: text("message"),
    routing: text("routing").notNull().default("sequential"),
    status: text("status").notNull().default("in_progress"),
    createdByUserProfileId: uuid("created_by_user_profile_id").references(
      () => userProfiles.id,
      { onDelete: "set null" },
    ),
    auditLog: jsonb("audit_log").notNull().default([]),
    /** SHA-256 hex digest of the final signed PDF. Written when the
     *  envelope completes. Lets anyone re-hash the file and verify it
     *  hasn't been altered since signing — the cornerstone of an
     *  enforceable tamper-evident audit trail. */
    signedDocumentHash: text("signed_document_hash"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("signature_envelopes_org_idx").on(t.orgId),
    engagementIdx: index("signature_envelopes_engagement_idx").on(
      t.engagementId,
    ),
    prospectIdx: index("signature_envelopes_prospect_idx").on(t.prospectId),
    statusIdx: index("signature_envelopes_status_idx").on(t.status),
  }),
);

/**
 * `signature_signers` — one row per signer per envelope.
 *
 * `public_token` is the URL-safe id used in /sign/[token] links.
 * `signature_image_data` holds the captured (or pre-applied) signature
 * as a data: URL — base64 PNG. `signature_method` is one of
 * "typed" / "drawn" / "uploaded" (the latter when a stored Coach
 * signature is auto-applied).
 *
 * Status ladder: pending → viewed → signed | declined.
 */
export const signatureSigners = pgTable(
  "signature_signers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    envelopeId: uuid("envelope_id")
      .notNull()
      .references((): AnyPgColumn => signatureEnvelopes.id, {
        onDelete: "cascade",
      }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    orderIndex: bigint("order_index", { mode: "number" }).notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    roleLabel: text("role_label"),
    publicToken: text("public_token").notNull().unique(),
    status: text("status").notNull().default("pending"),
    signatureImageData: text("signature_image_data"),
    signatureMethod: text("signature_method"),
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    /** When the signer explicitly ticked "I agree to sign electronically".
     *  Distinguishes "viewed the doc" from "agreed to e-sign" — the
     *  evidentiary backbone of the ESIGN / UETA / Alberta ETA consent
     *  prong. */
    consentedAt: timestamp("consented_at", { withTimezone: true }),
    /** Verbatim snapshot of the consent disclosure the signer saw when
     *  they ticked the box. If the disclosure wording changes later we
     *  still know exactly what THIS signer agreed to. */
    consentText: text("consent_text"),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    declinedReason: text("declined_reason"),
    signerIp: text("signer_ip"),
    signerUserAgent: text("signer_user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    envelopeIdx: index("signature_signers_envelope_idx").on(
      t.envelopeId,
      t.orderIndex,
    ),
    orgIdx: index("signature_signers_org_idx").on(t.orgId),
    emailIdx: index("signature_signers_email_idx").on(t.email),
  }),
);

/**
 * `notification_reads` — per-item read tracking on notifications.
 *
 * Phase 3.10. The `notifications.read_at` column already covers
 * "marked all read on visit" (Phase 1.2 helper). This table allows
 * per-notification read state tracking without modifying the
 * notifications row in-place — useful when a single notification
 * is shown across multiple surfaces.
 *
 * Composite PK (notification_id, user_profile_id). Phase 3.10b may
 * fold this into notifications via a JSONB column if multi-surface
 * isn't needed.
 */
export const notificationReads = pgTable(
  "notification_reads",
  {
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => notifications.id, { onDelete: "cascade" }),
    userProfileId: uuid("user_profile_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.notificationId, t.userProfileId] }),
    orgIdx: index("notification_reads_org_idx").on(t.orgId),
  }),
);

// ---------- Phase 2: audit_log ----------

/**
 * `audit_log` — append-only event stream for compliance + debugging.
 *
 * Phase 2.9. Every meaningful state change writes a row here. The
 * surface is open-ended via `entity_type` + `entity_id` so we don't
 * have to pre-declare every entity. `actor_user_profile_id` is the
 * caller; `metadata` is freeform JSONB for context.
 *
 * Tenant-scoped: the row carries `org_id` so RLS prevents one org's
 * audit from leaking into another. `system` events (cron, webhooks,
 * AI generations on system context) get the engagement's org id.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    actorUserProfileId: uuid("actor_user_profile_id").references(
      () => userProfiles.id,
      { onDelete: "set null" },
    ),
    eventType: auditEventTypeEnum("event_type").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    summary: text("summary").notNull(),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("audit_log_org_idx").on(t.orgId),
    actorIdx: index("audit_log_actor_idx").on(t.actorUserProfileId),
    entityIdx: index("audit_log_entity_idx").on(t.entityType, t.entityId),
    createdAtIdx: index("audit_log_created_at_idx").on(t.createdAt),
  }),
);

/**
 * `engagement_meetings` — Fireflies-synced meeting records per
 * engagement. One row per Fireflies transcript that includes at least
 * one attendee from the engagement's org. Sync upserts on
 * (engagement_id, fireflies_transcript_id) so re-runs don't dupe.
 *
 * Stores Fireflies' generated summary (overview + bullets + keywords)
 * but explicitly NOT the action items — the existing extraction
 * pipeline handles those separately and Bruce wants to keep it
 * manual.
 */
export const engagementMeetings = pgTable(
  "engagement_meetings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    firefliesTranscriptId: text("fireflies_transcript_id").notNull(),
    title: text("title").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    durationMin: integer("duration_min"),
    organizerEmail: text("organizer_email"),
    attendees: jsonb("attendees").notNull().default([]),
    summaryOverview: text("summary_overview"),
    summaryBullets: text("summary_bullets"),
    summaryKeywords: text("summary_keywords"),
    transcriptUrl: text("transcript_url"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    orgIdx: index("engagement_meetings_org_idx").on(t.orgId),
    engagementIdx: index("engagement_meetings_engagement_idx").on(
      t.engagementId,
    ),
    occurredAtIdx: index("engagement_meetings_occurred_at_idx").on(
      t.occurredAt,
    ),
    transcriptUnique: uniqueIndex(
      "engagement_meetings_engagement_transcript_unique",
    ).on(t.engagementId, t.firefliesTranscriptId),
  }),
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

export type ActionItem = typeof actionItems.$inferSelect;
export type NewActionItem = typeof actionItems.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type DocumentTag = typeof documentTags.$inferSelect;
export type NewDocumentTag = typeof documentTags.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type ProspectComment = typeof prospectComments.$inferSelect;
export type NewProspectComment = typeof prospectComments.$inferInsert;
export type MessageReaction = typeof messageReactions.$inferSelect;
export type NewMessageReaction = typeof messageReactions.$inferInsert;
export type MessageAttachment = typeof messageAttachments.$inferSelect;
export type NewMessageAttachment = typeof messageAttachments.$inferInsert;
export type BbsSession = typeof bbsSessions.$inferSelect;
export type NewBbsSession = typeof bbsSessions.$inferInsert;
export type SoulFile = typeof soulFiles.$inferSelect;
export type NewSoulFile = typeof soulFiles.$inferInsert;
export type SoulFileAiInsight = typeof soulFileAiInsights.$inferSelect;
export type NewSoulFileAiInsight = typeof soulFileAiInsights.$inferInsert;
export type Goal = typeof goals.$inferSelect;
export type NewGoal = typeof goals.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type Hire = typeof hires.$inferSelect;
export type NewHire = typeof hires.$inferInsert;
export type Form = typeof forms.$inferSelect;
export type NewForm = typeof forms.$inferInsert;
export type FormSubmission = typeof formSubmissions.$inferSelect;
export type NewFormSubmission = typeof formSubmissions.$inferInsert;
export type Deliverable = typeof deliverables.$inferSelect;
export type NewDeliverable = typeof deliverables.$inferInsert;
export type EmbeddedApp = typeof embeddedApps.$inferSelect;
export type NewEmbeddedApp = typeof embeddedApps.$inferInsert;
export type Course = typeof courses.$inferSelect;
export type NewCourse = typeof courses.$inferInsert;
export type Lesson = typeof lessons.$inferSelect;
export type NewLesson = typeof lessons.$inferInsert;
export type Cohort = typeof cohorts.$inferSelect;
export type NewCohort = typeof cohorts.$inferInsert;
export type Enrollment = typeof enrollments.$inferSelect;
export type NewEnrollment = typeof enrollments.$inferInsert;
export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;
export type PortalModuleAssignment = typeof portalModuleAssignments.$inferSelect;
export type NewPortalModuleAssignment = typeof portalModuleAssignments.$inferInsert;
export type Prospect = typeof prospects.$inferSelect;
export type NewProspect = typeof prospects.$inferInsert;
export type ProspectActivity = typeof prospectActivities.$inferSelect;
export type NewProspectActivity = typeof prospectActivities.$inferInsert;
export type PersonProfile = typeof personProfiles.$inferSelect;
export type NewPersonProfile = typeof personProfiles.$inferInsert;
export type SchedulingLink = typeof schedulingLinks.$inferSelect;
export type NewSchedulingLink = typeof schedulingLinks.$inferInsert;
export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;
export type SignatureEnvelope = typeof signatureEnvelopes.$inferSelect;
export type NewSignatureEnvelope = typeof signatureEnvelopes.$inferInsert;
export type SignatureSigner = typeof signatureSigners.$inferSelect;
export type NewSignatureSigner = typeof signatureSigners.$inferInsert;

/**
 * `template_conversions` — one row per Import-doc background job.
 *
 * Decouples the long-running Claude conversion from the client's
 * server-action call. The server action does the fast bits (extract
 * text, insert pending row), the API route at /api/templates/convert/[id]
 * does the slow Claude call with a 5-minute timeout, and the browser
 * polls /api/templates/convert/[id]/status until done.
 *
 * status ladder: pending → running → done | error
 *
 * result_json shape when status='done':
 *   { name, category, default_subject, body_markdown }
 *
 * source_text holds the extracted (capped) text; we don't persist
 * the source file itself.
 */
export const templateConversions = pgTable(
  "template_conversions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    userProfileId: uuid("user_profile_id").references(() => userProfiles.id, {
      onDelete: "set null",
    }),
    filename: text("filename"),
    sourceText: text("source_text").notNull(),
    status: text("status").notNull().default("pending"),
    resultJson: jsonb("result_json"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    userIdx: index("template_conversions_user_idx").on(
      t.userProfileId,
      t.createdAt,
    ),
    statusIdx: index("template_conversions_status_idx").on(
      t.status,
      t.createdAt,
    ),
  }),
);

export type TemplateConversion = typeof templateConversions.$inferSelect;
export type NewTemplateConversion = typeof templateConversions.$inferInsert;

/**
 * `resources` — Bruce + Jen's growing library of apps, tutorial
 * videos, and written guides. Catalogued here, deployed to specific
 * client engagements via the `resource_engagements` junction.
 *
 * Resource types:
 *   - tool: a deployable app (URL points at the live app)
 *   - video: tutorial video URL (YouTube, Loom, Vimeo, etc.)
 *   - document: written guide / PDF / article (URL or hosted markdown)
 *   - link: catch-all for any other useful reference
 */
export const resources = pgTable(
  "resources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    type: text("type").notNull().default("document"),
    url: text("url"),
    thumbnailUrl: text("thumbnail_url"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    audience: text("audience").notNull().default("coach_only"),
    isPublished: boolean("is_published").notNull().default(true),
    /** Where this resource came from. 'netlify' = synced from Bruce's
     *  Netlify account; null = manually added in the app. Drives the
     *  "Sync" button's upsert logic so re-runs don't duplicate. */
    source: text("source"),
    /** The source platform's stable id for the resource. Netlify
     *  uses site.id; future integrations use whatever the platform's
     *  primary key is. Paired with `source` to uniquely identify a
     *  synced row across re-syncs. */
    sourceId: text("source_id"),
    /** Last time this row was touched by an external sync. Null for
     *  manual entries. Surfaced in the UI as "Synced N min ago". */
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdByUserProfileId: uuid("created_by_user_profile_id").references(
      () => userProfiles.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    orgIdx: index("resources_org_idx").on(t.orgId, t.type),
    audienceIdx: index("resources_audience_idx").on(t.orgId, t.audience),
  }),
);

export const resourceEngagements = pgTable(
  "resource_engagements",
  {
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    deployedAt: timestamp("deployed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deployedByUserProfileId: uuid("deployed_by_user_profile_id").references(
      () => userProfiles.id,
      { onDelete: "set null" },
    ),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.resourceId, t.engagementId] }),
    engagementIdx: index("resource_engagements_engagement_idx").on(
      t.engagementId,
    ),
  }),
);

export type Resource = typeof resources.$inferSelect;
export type NewResource = typeof resources.$inferInsert;
export type ResourceEngagement = typeof resourceEngagements.$inferSelect;
export type QboOauthToken = typeof qboOauthTokens.$inferSelect;
export type NewQboOauthToken = typeof qboOauthTokens.$inferInsert;
export type GoogleCalendarToken = typeof googleCalendarTokens.$inferSelect;
export type NewGoogleCalendarToken = typeof googleCalendarTokens.$inferInsert;
export type GoogleCalendarEventMapping =
  typeof googleCalendarEventMappings.$inferSelect;
export type NewGoogleCalendarEventMapping =
  typeof googleCalendarEventMappings.$inferInsert;
export type ClientCommunication = typeof clientCommunications.$inferSelect;
export type NewClientCommunication = typeof clientCommunications.$inferInsert;
export type CommunicationAlias = typeof communicationAliases.$inferSelect;
export type NewCommunicationAlias = typeof communicationAliases.$inferInsert;
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type NewEmailTemplate = typeof emailTemplates.$inferInsert;
export type NotificationRead = typeof notificationReads.$inferSelect;
export type NewNotificationRead = typeof notificationReads.$inferInsert;
export type LessonCompletion = typeof lessonCompletions.$inferSelect;
export type NewLessonCompletion = typeof lessonCompletions.$inferInsert;
