"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { updateProspect } from "@/lib/actions/prospects";

const STATUS_OPTIONS = [
  { value: "diagnostic_pending", label: "Diagnostic pending" },
  { value: "diagnostic_complete", label: "Diagnostic complete" },
  { value: "proposal_sent", label: "Proposal sent" },
  { value: "contract_sent", label: "Contract sent" },
  { value: "contract_signed", label: "Contract signed" },
  { value: "onboarded", label: "Onboarded" },
  { value: "lost", label: "Lost" },
] as const;

export function ProspectStatusSelect({
  prospectId,
  current,
}: {
  prospectId: string;
  current: string;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      {isPending && (
        <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" aria-hidden />
      )}
      <select
        value={current}
        disabled={isPending}
        onChange={(e) => {
          const next = e.target.value as (typeof STATUS_OPTIONS)[number]["value"];
          startTransition(async () => {
            await updateProspect({ id: prospectId, status: next });
          });
        }}
        className="font-mono text-[10px] uppercase tracking-tbb-caps bg-white border border-tbb-line rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-tbb-blue"
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}
