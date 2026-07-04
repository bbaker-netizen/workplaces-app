import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { listMarketingContacts } from "@/lib/db/queries/marketing-contacts";
import { MarketingListClient } from "@/components/marketing/MarketingListClient";

/**
 * Marketing list — contacts kept separate from the sales pipeline, used for
 * marketing (first source: the WordPress / Formidable import). Search,
 * export, and per-row delete. Business Builder side only.
 */
export default async function MarketingListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  const { q } = await searchParams;
  const { contacts, total } = await listMarketingContacts(q);

  return (
    <main className="max-w-5xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          Business Builder
        </p>
        <h1 className="font-display font-bold text-foreground text-4xl tracking-tight leading-none">
          Marketing list
        </h1>
        <p className="font-sans text-sm text-muted-foreground">
          {total} contact{total === 1 ? "" : "s"} for marketing — separate
          from your sales pipeline, so they never affect your Reports.
        </p>
      </header>

      <form method="get" className="flex items-center gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search name, email, or company…"
          className="flex-1 max-w-sm bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
        />
        <button
          type="submit"
          className="text-xs font-bold uppercase tracking-tbb-caps px-3 py-2 rounded-pill border border-tbb-line bg-white hover:border-tbb-blue"
        >
          Search
        </button>
        {q ? (
          <Link
            href="/business-builder/marketing"
            className="text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
          >
            Clear
          </Link>
        ) : null}
      </form>

      {q && (
        <p className="text-xs text-tbb-ink-3">
          Showing {contacts.length} result{contacts.length === 1 ? "" : "s"} for
          &ldquo;{q}&rdquo;.
        </p>
      )}

      <MarketingListClient contacts={contacts} />
    </main>
  );
}
