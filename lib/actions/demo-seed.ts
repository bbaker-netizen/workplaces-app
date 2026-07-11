"use server";

/**
 * Demo engagement seeder.
 *
 * Builds ONE fully-populated, active engagement in the master org so Bruce
 * can walk every portal module end-to-end with realistic data. It is a
 * normal engagement row, so the standard Archive and Delete controls on
 * the engagements list work on it exactly like any real client.
 *
 * Master-admin only. Idempotent-ish: if a non-archived demo already
 * exists it returns that one instead of creating a duplicate (delete or
 * archive it first to seed a fresh copy).
 */

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { withTenantContext } from "@/lib/db/tenant";
import { uploadDocumentBlob } from "@/lib/storage/blobs";
import {
  actionItems,
  bbsSessions,
  coaches,
  deliverables,
  documents,
  engagements,
  forms,
  formSubmissions,
  goals,
  hires,
  messages,
  messageReactions,
  personProfiles,
  projects,
  prospects,
  soulFiles,
  tasks,
} from "@/lib/db/schema";

type Result =
  | { ok: true; engagementId: string; slug: string; existed: boolean }
  | { ok: false; error: string };

const DEMO_NAME = "Northwind Builders (Demo)";

/** name → url-safe slug + a uuid fragment for uniqueness. */
function slugify(name: string, id: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const frag = id.slice(0, 6);
  return base ? `${base}-${frag}` : `demo-${id.slice(0, 12)}`;
}

/** now ± n days as a Date. */
function days(n: number): Date {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}

export async function seedDemoEngagement(): Promise<Result> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin") {
    return { ok: false, error: "Master admins only." };
  }

  const orgId = profile.orgId;
  const me = profile.userProfileId;

  try {
    // Don't stack duplicates — reuse a live demo if one's already here.
    const existing = await withTenantContext(orgId, async (tx) =>
      tx
        .select({ id: engagements.id, slug: engagements.slug })
        .from(engagements)
        .where(
          and(
            eq(engagements.orgId, orgId),
            eq(engagements.name, DEMO_NAME),
            isNull(engagements.archivedAt),
          ),
        )
        .limit(1),
    );
    if (existing[0]?.slug) {
      return {
        ok: true,
        engagementId: existing[0].id,
        slug: existing[0].slug,
        existed: true,
      };
    }

    // Lazy-ensure the caller has a coaches row (engagement.coach_id FK).
    const coach = await withTenantContext(orgId, async (tx) => {
      const [row] = await tx
        .select()
        .from(coaches)
        .where(eq(coaches.userProfileId, me))
        .limit(1);
      if (row) return row;
      const [created] = await tx
        .insert(coaches)
        .values({ orgId, userProfileId: me, status: "active" })
        .returning();
      return created;
    });

    const engagementId = randomUUID();
    const slug = slugify(DEMO_NAME, engagementId);
    const projectAppId = randomUUID();
    const projectHireId = randomUUID();
    const leadershipMsgId = randomUUID();

    await withTenantContext(orgId, async (tx) => {
      // Engagement (active) + linked, converted prospect.
      await tx.insert(engagements).values({
        id: engagementId,
        orgId,
        coachId: coach.id,
        type: "accelerator",
        name: DEMO_NAME,
        status: "active",
        startDate: days(-90),
        startedAt: days(-90),
        slug,
        monthlyFeeCents: 350000,
        pricingTier: "growth",
        stageOfGrowthStage: 3,
      });

      await tx.insert(prospects).values({
        orgId,
        companyName: DEMO_NAME,
        contactName: "Dana Whitfield",
        contactEmail: "dana@northwind-demo.example",
        phone: "(780) 555-0142",
        companyWebsite: "https://northwind-demo.example",
        linkedinUrl: "https://www.linkedin.com/company/northwind-demo",
        industry: "Commercial construction",
        leadSource: "Referral",
        source: "referral",
        firstSeenAt: new Date(),
        becameClientAt: new Date(),
        status: "onboarded",
        programType: "accelerator",
        pricingTier: "growth",
        monthlyFeeCents: 350000,
        notes:
          "**Demo prospect.** Converted to the sample engagement so you can see the pipeline → portal link.",
        convertedEngagementId: engagementId,
      });

      // Action items — varied status / due / impact, a couple assigned to you.
      await tx.insert(actionItems).values([
        {
          orgId,
          engagementId,
          title: "Finalize Q3 cash-flow dashboard inputs",
          description:
            "Pull the last 3 months of AR aging so we can model the summer slowdown.",
          status: "in_progress",
          createdBy: "coach",
          assigneeUserProfileId: me,
          dueDate: days(2),
          revenueImpact: true,
          marginImpact: true,
        },
        {
          orgId,
          engagementId,
          title: "Draft the field-supervisor job profile",
          status: "open",
          createdBy: "coach",
          assigneeUserProfileId: me,
          dueDate: days(-1),
          marginImpact: true,
        },
        {
          orgId,
          engagementId,
          title: "Confirm crew onboarding checklist with ops lead",
          status: "open",
          createdBy: "claude",
          confidenceFlag: "medium",
          dueDate: days(6),
        },
        {
          orgId,
          engagementId,
          title: "Send revised pricing sheet to estimating",
          status: "done",
          createdBy: "coach",
          dueDate: days(-8),
          revenueImpact: true,
        },
        {
          orgId,
          engagementId,
          title: "Review draft SOP for change-order approvals",
          description: "Extracted from the last BBS — confirm the dollar threshold.",
          status: "draft",
          createdBy: "claude",
          confidenceFlag: "high",
        },
        {
          orgId,
          engagementId,
          title: "Block recurring twice-monthly BBS on the calendar",
          status: "open",
          createdBy: "coach",
          assigneeUserProfileId: me,
          dueDate: days(10),
        },
      ]);

      // BBS sessions — two completed, two upcoming.
      await tx.insert(bbsSessions).values([
        {
          orgId,
          engagementId,
          scheduledAt: days(-28),
          type: "in_person",
          status: "completed",
          createdByUserProfileId: me,
          notes:
            "Kickoff. Mapped the org chart and agreed the first three deliverables.",
        },
        {
          orgId,
          engagementId,
          scheduledAt: days(-14),
          type: "virtual",
          status: "completed",
          createdByUserProfileId: me,
          notes: "Reviewed cash-flow model; assigned the dashboard build.",
        },
        {
          orgId,
          engagementId,
          scheduledAt: days(3),
          type: "in_person",
          status: "scheduled",
          createdByUserProfileId: me,
          notes: "Agenda: hiring plan for the field supervisor role.",
        },
        {
          orgId,
          engagementId,
          scheduledAt: days(17),
          type: "virtual",
          status: "scheduled",
          createdByUserProfileId: me,
        },
      ]);

      // Goals
      await tx.insert(goals).values([
        {
          orgId,
          engagementId,
          title: "Grow top-line revenue 20% by year end",
          description: "From $4.2M to ~$5.0M, led by the new estimating capacity.",
          status: "in_progress",
          targetMetric: "Annual revenue",
          targetValue: "$5.0M",
          targetDate: days(180),
          revenueImpact: true,
          ownerUserProfileId: me,
        },
        {
          orgId,
          engagementId,
          title: "Lift gross margin from 18% to 24%",
          status: "in_progress",
          targetMetric: "Gross margin %",
          targetValue: "24%",
          targetDate: days(150),
          marginImpact: true,
        },
        {
          orgId,
          engagementId,
          title: "Hire and onboard a field supervisor",
          status: "open",
          targetDate: days(60),
          marginImpact: true,
        },
      ]);

      // Projects + tasks
      await tx.insert(projects).values([
        {
          id: projectAppId,
          orgId,
          engagementId,
          name: "Financial dashboard build",
          description: "Stand up the live cash-flow + margin dashboard.",
          status: "active",
          leadUserProfileId: me,
          startDate: days(-20),
          targetDate: days(20),
          revenueImpact: true,
          marginImpact: true,
        },
        {
          id: projectHireId,
          orgId,
          engagementId,
          name: "Field supervisor hire",
          description: "Run the hiring pipeline for the new supervisor role.",
          status: "planning",
          leadUserProfileId: me,
          startDate: days(-5),
          targetDate: days(60),
          marginImpact: true,
        },
      ]);

      await tx.insert(tasks).values([
        {
          orgId,
          projectId: projectAppId,
          title: "Connect QuickBooks Online",
          status: "done",
          orderIndex: 0,
          percentComplete: 100,
        },
        {
          orgId,
          projectId: projectAppId,
          title: "Model summer slowdown scenario",
          status: "in_progress",
          orderIndex: 1,
          percentComplete: 40,
          assigneeUserProfileId: me,
          dueDate: days(4),
        },
        {
          orgId,
          projectId: projectAppId,
          title: "Review dashboard with leadership",
          status: "todo",
          orderIndex: 2,
          dueDate: days(18),
        },
        {
          orgId,
          projectId: projectHireId,
          title: "Configure TTI job benchmark",
          status: "in_progress",
          orderIndex: 0,
          percentComplete: 25,
        },
        {
          orgId,
          projectId: projectHireId,
          title: "Screen first three candidates",
          status: "todo",
          orderIndex: 1,
          dueDate: days(21),
        },
      ]);

      // Deliverables (across types + lifecycle states)
      await tx.insert(deliverables).values([
        {
          orgId,
          engagementId,
          type: "financial_dashboard",
          title: "Cash-flow & margin dashboard",
          status: "in_progress",
          targetDate: days(20),
          revenueImpact: true,
          marginImpact: true,
        },
        {
          orgId,
          engagementId,
          type: "org_chart",
          title: "Current-state org chart",
          status: "delivered",
          deliveredAt: days(-21),
        },
        {
          orgId,
          engagementId,
          type: "job_profile",
          title: "Field supervisor job profile & interview guide",
          status: "review",
          targetDate: days(12),
          marginImpact: true,
        },
        {
          orgId,
          engagementId,
          type: "sop",
          title: "Change-order approval SOP",
          status: "not_started",
          targetDate: days(35),
        },
      ]);

      // Soul File
      await tx.insert(soulFiles).values({
        orgId,
        engagementId,
        lastEditorUserProfileId: me,
        body: [
          "# Northwind Builders — Soul File (Demo)",
          "",
          "## Why this engagement exists",
          "Second-generation commercial GC. Strong backlog, thin margins, owner stuck in the field instead of running the business.",
          "",
          "## Where it's at today",
          "~$4.2M revenue, 18% gross margin, 22 staff. No financial visibility between month-end closes.",
          "",
          "## Where it wants to be in 12 months",
          "$5.0M revenue at 24% margin, a field supervisor owning day-to-day site delivery, and a live dashboard the owner trusts.",
          "",
          "## Hard-won learnings",
          "- Bids win on relationships, not price — protect the margin.",
          "- The last two hires failed on fit, not skill. TTI benchmark this time.",
        ].join("\n"),
      });

      // Communication — leadership + team threads (parentEntityId = engagement).
      await tx.insert(messages).values([
        {
          id: leadershipMsgId,
          orgId,
          engagementId,
          parentEntityType: "engagement_leadership",
          parentEntityId: engagementId,
          authorUserProfileId: me,
          body: "Welcome to The Builder, Dana. This leadership thread is just for you and me — let's line up the hiring plan for our next session.",
        },
        {
          orgId,
          engagementId,
          parentEntityType: "engagement_leadership",
          parentEntityId: engagementId,
          authorUserProfileId: me,
          body: "I've dropped the draft job profile into Deliverables for your review.",
        },
        {
          orgId,
          engagementId,
          parentEntityType: "engagement_team",
          parentEntityId: engagementId,
          authorUserProfileId: me,
          body: "Team — the new cash-flow dashboard is taking shape under Projects. Shout if anything looks off.",
        },
        {
          orgId,
          engagementId,
          parentEntityType: "engagement_team",
          parentEntityId: engagementId,
          authorUserProfileId: me,
          body: "Reminder: next BBS is on the calendar — agenda is the supervisor hire.",
        },
      ]);

      await tx.insert(messageReactions).values({
        orgId,
        messageId: leadershipMsgId,
        userProfileId: me,
        emoji: "👍",
      });

      // People (TTI profiles)
      await tx.insert(personProfiles).values([
        {
          orgId,
          engagementId,
          fullName: "Dana Whitfield",
          role: "Owner / President",
          source: "tti_trimetrix_hd",
          assessmentDate: days(-25),
          summary:
            "High Dominance / High Compliance. Drives results but holds detail too tightly — delegation is the growth edge.",
        },
        {
          orgId,
          engagementId,
          fullName: "Marco Reyes",
          role: "Operations Lead",
          source: "tti_trimetrix_hd",
          assessmentDate: days(-25),
          summary: "Steady, process-oriented. Strong fit to own site delivery systems.",
        },
      ]);

      // Hiring pipeline
      await tx.insert(hires).values([
        {
          orgId,
          engagementId,
          candidateName: "Priya Anand",
          candidateEmail: "priya@example.com",
          roleName: "Field Supervisor",
          status: "interview_scheduled",
          createdByUserProfileId: me,
          interviewScheduledAt: days(5),
          notes: "Strong on-site experience; TTI benchmark pending.",
        },
        {
          orgId,
          engagementId,
          candidateName: "Tom Becker",
          roleName: "Field Supervisor",
          status: "assessing",
          createdByUserProfileId: me,
        },
      ]);

      // Forms + one submission
      const [intakeForm] = await tx
        .insert(forms)
        .values({
          orgId,
          engagementId,
          name: "Quarterly pulse check",
          type: "pulse",
          description: "A quick read on how the engagement is landing.",
        })
        .returning({ id: forms.id });
      if (intakeForm) {
        await tx.insert(formSubmissions).values({
          orgId,
          formId: intakeForm.id,
          respondentName: "Dana Whitfield",
          respondentEmail: "dana@northwind-demo.example",
          answers: {
            confidence: "8/10",
            biggest_win: "Finally have visibility into margin by job.",
          },
        });
      }
    });

    // Documents — best-effort real blobs so the module isn't empty. If
    // Blobs isn't configured in this environment we just skip them; the
    // rest of the demo is already committed.
    try {
      const samples = [
        {
          filename: "Northwind-Org-Chart.txt",
          body: "DEMO DOCUMENT\n\nNorthwind Builders — current-state org chart.\nOwner → Ops Lead → (Field Supervisor TBD) → Crews.",
        },
        {
          filename: "Change-Order-SOP-draft.txt",
          body: "DEMO DOCUMENT\n\nChange-order approval SOP (draft).\nAny change order over $2,500 requires owner sign-off before work proceeds.",
        },
      ];
      for (const s of samples) {
        const file = new File([s.body], s.filename, { type: "text/plain" });
        const up = await uploadDocumentBlob(orgId, file);
        await withTenantContext(orgId, async (tx) => {
          await tx.insert(documents).values({
            id: up.documentId,
            orgId,
            engagementId,
            blobKey: up.blobKey,
            originalFilename: up.filename,
            fileType: up.fileType,
            sizeBytes: up.sizeBytes,
            uploaderUserProfileId: me,
          });
        });
      }
    } catch (e) {
      console.warn(
        "[seedDemoEngagement] document seed skipped (Blobs unavailable):",
        e instanceof Error ? e.message : e,
      );
    }

    revalidatePath("/business-builder/engagements");
    revalidatePath("/portal");
    return { ok: true, engagementId, slug, existed: false };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
