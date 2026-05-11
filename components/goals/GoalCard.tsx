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
  in_progress: "text-tbb-navy font-bold",
  achieved: "text-tbb-navy font-bold",
  missed: "text-tbb-danger font-bold",
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
          "block py-4 pl-4 border-l-2 group hover:bg-tbb-cream-50 transition-colors " +
          (isPast ? "border-tbb-danger" : "border-transparent")
        }
      >
        <div className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap">
          <span className="font-bold text-foreground text-base sm:text-lg tracking-tight group-hover:underline underline-offset-4">
            {goal.title}
          </span>
          <span
            className={
              "ml-auto font-mono text-[10px] uppercase tracking-tbb-caps " +
              (STATUS_TONE[goal.status] ?? "text-muted-foreground")
            }
          >
            {isPast && goal.status !== "missed"
              ? "Past target"
              : STATUS_LABEL[goal.status] ?? goal.status}
          </span>
        </div>
        <div className="mt-1 flex items-baseline gap-x-3 gap-y-0.5 flex-wrap font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
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
              <span className="rounded-full border border-tbb-blue text-tbb-navy bg-tbb-cream-50 px-2 py-px">
                Revenue
              </span>
            )}
            {goal.marginImpact && (
              <span className="rounded-full border border-tbb-blue text-tbb-navy bg-tbb-cream-50 px-2 py-px">
                Margin
              </span>
            )}
          </span>
        </div>
      </Link>
    </li>
  );
}
