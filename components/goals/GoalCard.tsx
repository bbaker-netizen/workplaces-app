/**
 * GoalCard — server component, single goal row in the list.
 */

import Link from "next/link";

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  achieved: "Achieved",
  missed: "Missed",
  abandoned: "Abandoned",
};

const STATUS_TONE: Record<string, string> = {
  open: "text-muted-foreground",
  in_progress: "text-[#2E4057] font-bold",
  achieved: "text-[#2E4057] font-bold",
  missed: "text-[#E87722] font-bold",
  abandoned: "text-muted-foreground line-through",
};

export function GoalCard({
  goal,
  href,
}: {
  goal: {
    id: string;
    title: string;
    targetMetric: string | null;
    targetValue: string | null;
    targetDate: Date | null;
    status: string;
    revenueImpact: boolean;
    marginImpact: boolean;
    ownerName: string | null;
  };
  href: string;
}) {
  const isPast =
    goal.targetDate !== null &&
    goal.targetDate < new Date() &&
    goal.status !== "achieved" &&
    goal.status !== "abandoned";
  return (
    <li>
      <Link
        href={href}
        className={
          "block py-4 pl-4 border-l-2 group hover:bg-[#F5F1E8] transition-colors " +
          (isPast ? "border-[#E87722]" : "border-transparent")
        }
      >
        <div className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap">
          <span className="font-display font-bold text-foreground text-base sm:text-lg tracking-tight group-hover:underline underline-offset-4">
            {goal.title}
          </span>
          <span
            className={
              "ml-auto font-mono text-[10px] uppercase tracking-[0.2em] " +
              (STATUS_TONE[goal.status] ?? "text-muted-foreground")
            }
          >
            {isPast && goal.status !== "missed"
              ? "Past target"
              : STATUS_LABEL[goal.status] ?? goal.status}
          </span>
        </div>
        <div className="mt-1 flex items-baseline gap-x-3 gap-y-0.5 flex-wrap font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
          {goal.targetMetric && (
            <span>
              Target: <span className="text-foreground">{goal.targetMetric}</span>
              {goal.targetValue && (
                <> · <span className="text-foreground">{goal.targetValue}</span></>
              )}
            </span>
          )}
          {goal.targetDate && (
            <span>
              By{" "}
              {goal.targetDate.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          )}
          {goal.ownerName && <span>· {goal.ownerName}</span>}
          <span className="ml-auto flex gap-1">
            {goal.revenueImpact && (
              <span className="rounded-full border border-[#2E4057] text-[#2E4057] bg-[#F5F1E8] px-2 py-px">
                Revenue
              </span>
            )}
            {goal.marginImpact && (
              <span className="rounded-full border border-[#2E4057] text-[#2E4057] bg-[#F5F1E8] px-2 py-px">
                Margin
              </span>
            )}
          </span>
        </div>
      </Link>
    </li>
  );
}
