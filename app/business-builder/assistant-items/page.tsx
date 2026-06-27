/**
 * Business Builder console — "From the AI Assistant" (read-only).
 *
 * Phase 1 of the assistant → portal integration. Surfaces the assistant's
 * open action items, grouped by client, read straight from the Command
 * Central gateway on each load. The assistant stays the source of truth:
 * this page only displays, it never edits, completes, or writes anything
 * back, and it does not merge into the app's own `action_items` table.
 *
 * Coach / master_admin only — same gate as the all-engagements action
 * items page.
 */

import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  readAssistantActionItems,
  type AssistantItem,
} from "@/lib/assistant/gateway";
import { formatDueDate } from "@/components/action-items/utils";

export const dynamic = "force-dynamic";

function isOverdue(due: string | null): boolean {
  if (!due) return false;
  return new Date(due).getTime() < Date.now();
}

function ItemRow({ item }: { item: AssistantItem }) {
  const overdue = isOverdue(item.due);
  return (
    <article
      className={
        "bg-white border rounded-md " +
        (overdue
          ? "border-tbb-danger shadow-[inset_4px_0_0_0_#E87722]"
          : "border-tbb-line")
      }
    >
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 mb-2">
          <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
            {item.id}
          </span>
          <div className="flex gap-1.5 flex-wrap justify-end">
            <span className="font-mono text-[9px] uppercase tracking-tbb-caps px-2 py-0.5 rounded-sm border border-tbb-line text-muted-foreground">
              {item.source || "Source"}
            </span>
            <span className="font-mono text-[9px] uppercase tracking-tbb-caps px-2 py-0.5 rounded-sm border border-tbb-navy text-tbb-navy">
              P{item.priority}
            </span>
          </div>
        </div>
        <p className="font-bold text-foreground tracking-tight text-lg sm:text-xl leading-snug">
          {item.item}
        </p>
        <p
          className={
            "mt-2 font-mono text-xs uppercase tracking-tbb-caps " +
            (overdue ? "text-tbb-danger" : "text-muted-foreground")
          }
        >
          {formatDueDate(item.due)}
          {item.slip > 0 ? ` · slipped ${item.slip}×` : ""}
        </p>
      </div>
    </article>
  );
}

export default async function AssistantItemsPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  const result = await readAssistantActionItems();

  return (
    <main className="max-w-5xl mx-auto px-6 py-12">
      <header className="mb-8 space-y-2">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          Business Builder Console
        </p>
        <h1 className="font-bold text-foreground text-4xl tracking-tight leading-none">
          From the AI Assistant
        </h1>
        <p className="font-sans text-muted-foreground max-w-xl leading-relaxed">
          Open action items the assistant is tracking, grouped by client, read
          live from Command Central. The assistant is the source of truth: this
          view is read-only. Work the items in the assistant; this list reflects
          its current state on each load.
        </p>
      </header>

      {!result.ok ? (
        <div className="bg-white border border-tbb-danger rounded-md p-5">
          <p className="font-bold text-foreground">
            Could not reach the assistant.
          </p>
          <p className="mt-1 text-muted-foreground text-sm">{result.error}</p>
        </div>
      ) : result.groups.length === 0 ? (
        <div className="bg-white border border-tbb-line rounded-md p-5">
          <p className="font-bold text-foreground">Nothing open.</p>
          <p className="mt-1 text-muted-foreground text-sm">
            The assistant has no open action items right now.
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {result.groups.map((group) => (
            <section key={group.client}>
              <h2 className="font-bold text-foreground text-xl tracking-tight mb-3">
                {group.client}{" "}
                <span className="font-sans font-normal text-muted-foreground text-base">
                  ({group.items.length})
                </span>
              </h2>
              <div className="space-y-3">
                {group.items.map((item) => (
                  <ItemRow key={item.id} item={item} />
                ))}
              </div>
            </section>
          ))}
          <p className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
            {result.count} open item{result.count === 1 ? "" : "s"} ·
            {" "}read {new Date(result.fetchedAt).toLocaleString("en-CA")}
          </p>
        </div>
      )}
    </main>
  );
}
