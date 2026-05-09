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
 * coach visibility (Coach My Work) is a Phase 2+ concern handled via a
 * future engagement_membership junction.
 */

import {
  type AnyPgColumn,
  bigint,
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
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
  name: text("name").notNull(),
  type: orgTypeEnum("type").notNull().default("client"),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("user_profiles_org_idx").on(t.orgId),
  })
);

/**
 * `coaches` — Workplaces coaches (Bruce, Jen, future hires).
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("engagements_org_idx").on(t.orgId),
    coachIdx: index("engagements_coach_idx").on(t.coachId),
  })
);

// ---------- Phase 1.1 tables ----------

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
 * Created either by a coach manually (status=open) or by Claude from a
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
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    blobKey: text("blob_key").notNull().unique(),
    originalFilename: text("original_filename").notNull(),
    fileType: text("file_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    uploaderUserProfileId: uuid("uploader_user_profile_id")
      .notNull()
      .references(() => userProfiles.id),
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
export type MessageReaction = typeof messageReactions.$inferSelect;
export type NewMessageReaction = typeof messageReactions.$inferInsert;
export type MessageAttachment = typeof messageAttachments.$inferSelect;
export type NewMessageAttachment = typeof messageAttachments.$inferInsert;
export type BbsSession = typeof bbsSessions.$inferSelect;
export type NewBbsSession = typeof bbsSessions.$inferInsert;
