"use client";

/**
 * Coach-side wrapper around ActionItemForm — adds an engagement picker.
 *
 * When the coach changes the engagement, the underlying ActionItemForm
 * remounts (key prop bound to engagementId) so initial defaults
 * recompute against the new engagement's members. In-progress edits
 * reset; that's acceptable here because changing engagement implies
 * starting fresh.
 */

import { useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import {
  ActionItemForm,
  type ActionItemFormMember,
} from "./ActionItemForm";
import type { ActionItemStatus } from "./utils";

export type CoachFormEngagement = {
  id: string;
  name: string | null;
  members: Array<ActionItemFormMember & { role: string }>;
};

const inputClass =
  "w-full px-3 py-2 border border-tbb-line rounded-md bg-white text-foreground " +
  "focus:outline-none focus:ring-2 focus:ring-tbb-blue focus:border-transparent " +
  "font-sans";

const labelClass =
  "block font-sans text-sm font-bold text-foreground mb-1.5";

function pickDefaultAssignee(
  members: CoachFormEngagement["members"],
  fallback: string,
): string {
  const lead = members.find((m) => m.role === "client_lead");
  if (lead) return lead.id;
  const nonCoach = members.find(
    (m) => m.role !== "master_admin" && m.role !== "coach",
  );
  if (nonCoach) return nonCoach.id;
  return fallback;
}

export function CoachNewActionItemForm({
  engagements,
  initialEngagementId,
  currentUserProfileId,
  statusOptions,
}: {
  engagements: CoachFormEngagement[];
  initialEngagementId: string;
  currentUserProfileId: string;
  statusOptions: readonly ActionItemStatus[];
}) {
  const [engagementId, setEngagementId] = useState(initialEngagementId);

  const engagement = useMemo(
    () => engagements.find((e) => e.id === engagementId) ?? engagements[0],
    [engagements, engagementId],
  );

  const defaultAssignee = useMemo(
    () => pickDefaultAssignee(engagement.members, currentUserProfileId),
    [engagement, currentUserProfileId],
  );

  const defaultDue = format(addDays(new Date(), 14), "yyyy-MM-dd");

  return (
    <div className="space-y-6">
      <div>
        <label htmlFor="engagement" className={labelClass}>
          Engagement
        </label>
        <select
          id="engagement"
          value={engagementId}
          onChange={(e) => setEngagementId(e.target.value)}
          className={inputClass}
        >
          {engagements.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name ?? "(unnamed)"}
            </option>
          ))}
        </select>
      </div>

      <ActionItemForm
        key={engagementId}
        mode="create"
        engagementId={engagementId}
        members={engagement.members.map((m) => ({
          id: m.id,
          fullName: m.fullName,
        }))}
        statusOptions={statusOptions}
        initialValues={{
          title: "",
          description: "",
          status: "open",
          assigneeUserProfileId: defaultAssignee,
          dueDate: defaultDue,
          revenueImpact: false,
          marginImpact: false,
        }}
        cancelHref="/coach/action-items"
        successHref="/coach/action-items"
      />
    </div>
  );
}
