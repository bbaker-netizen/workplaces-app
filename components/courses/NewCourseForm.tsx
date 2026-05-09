"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { createCourse } from "@/lib/actions/courses";

export function NewCourseForm({ engagementId }: { engagementId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [deliveryMode, setDeliveryMode] = useState<"self_paced" | "cohort">(
    "self_paced",
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createCourse({
        engagementId,
        name: name.trim(),
        description: description.trim() || null,
        deliveryMode,
      });
      if (!result.ok) setError(result.error);
      else {
        router.push(`/portal/courses/${result.data.id}`);
        router.refresh();
      }
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-4"
      aria-busy={isPending}
    >
      <label className="block space-y-1">
        <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
          Course name
        </span>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isPending}
          className="w-full bg-white border border-[#CCCCCC] rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-[#2E4057]"
        />
      </label>
      <label className="block space-y-1">
        <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
          Description (markdown)
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          disabled={isPending}
          className="w-full bg-white border border-[#CCCCCC] rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-[#2E4057] resize-y"
        />
      </label>
      <label className="block space-y-1">
        <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
          Delivery mode
        </span>
        <select
          value={deliveryMode}
          onChange={(e) =>
            setDeliveryMode(e.target.value as "self_paced" | "cohort")
          }
          disabled={isPending}
          className="w-full bg-white border border-[#CCCCCC] rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-[#2E4057]"
        >
          <option value="self_paced">Self-paced</option>
          <option value="cohort">Cohort</option>
        </select>
      </label>
      {error && (
        <p
          role="alert"
          className="font-sans text-sm text-[#E87722] border border-[#E87722] rounded-md px-3 py-2 bg-[#F5F1E8]"
        >
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => router.push("/portal/courses")}
          disabled={isPending}
          className="font-sans text-xs uppercase tracking-[0.15em] px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 font-sans text-sm font-bold uppercase tracking-[0.15em] px-4 py-2 rounded-md bg-[#1A1A1A] text-[#F5F1E8] hover:bg-[#2E4057] disabled:opacity-50"
        >
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          {isPending ? "Creating…" : "Create course"}
        </button>
      </div>
    </form>
  );
}
