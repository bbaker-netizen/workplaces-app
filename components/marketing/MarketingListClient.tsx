"use client";

/**
 * Marketing-list table — renders the contacts, a per-row delete, and a
 * "Export CSV" button that downloads the current list (handy for pushing
 * into an email tool). Client-only interactions; the list itself is fetched
 * server-side and passed in.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Loader2, Trash2, Upload } from "lucide-react";
import { deleteMarketingContact } from "@/lib/actions/marketing-contacts";
import type { MarketingContact } from "@/lib/db/schema";

export function MarketingListClient({
  contacts,
}: {
  contacts: MarketingContact[];
}) {
  function exportCsv() {
    const header = ["Name", "Email", "Phone", "Company", "Source"];
    const rows = contacts.map((c) => [
      c.name ?? "",
      c.email,
      c.phone ?? "",
      c.company ?? "",
      c.source,
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map(csvCell).join(","))
      .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "marketing-list.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (contacts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-tbb-line bg-white px-6 py-12 text-center space-y-3">
        <p className="font-bold text-tbb-navy text-lg">No marketing contacts yet</p>
        <p className="text-sm text-tbb-ink-3">
          Upload your WordPress / Formidable export (XML or CSV) to build the
          list.
        </p>
        <Link
          href="/business-builder/tools/import-marketing"
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700"
        >
          <Upload className="w-3.5 h-3.5" aria-hidden /> Import list
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill border border-tbb-line bg-white hover:border-tbb-blue"
        >
          <Download className="w-3.5 h-3.5" aria-hidden /> Export CSV
        </button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-tbb-line">
        <table className="w-full text-sm">
          <thead className="bg-tbb-cream-50 text-left">
            <tr className="[&_th]:px-3 [&_th]:py-2 [&_th]:text-[10px] [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-tbb-caps [&_th]:text-tbb-ink-3">
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Company</th>
              <th>Source</th>
              <th className="w-8" aria-label="Actions" />
            </tr>
          </thead>
          <tbody className="divide-y divide-tbb-line-soft">
            {contacts.map((c) => (
              <Row key={c.id} contact={c} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ contact }: { contact: MarketingContact }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [gone, setGone] = useState(false);
  if (gone) return null;

  return (
    <tr className="[&_td]:px-3 [&_td]:py-2 text-tbb-ink-2 group">
      <td className="font-medium text-tbb-navy">{contact.name ?? "—"}</td>
      <td className="break-all">
        {contact.email}
        {contact.matchedProspectId && (
          <span className="ml-2 text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-blue">
            in pipeline
          </span>
        )}
      </td>
      <td>{contact.phone ?? "—"}</td>
      <td>{contact.company ?? "—"}</td>
      <td>{contact.source}</td>
      <td>
        <button
          type="button"
          aria-label="Delete contact"
          onClick={() => {
            if (!window.confirm(`Remove ${contact.email} from the list?`)) return;
            startTransition(async () => {
              const r = await deleteMarketingContact({ id: contact.id });
              if (r.ok) {
                setGone(true);
                router.refresh();
              } else {
                window.alert(r.error);
              }
            });
          }}
          disabled={isPending}
          className="text-tbb-ink-4 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-tbb-danger disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
          ) : (
            <Trash2 className="w-3.5 h-3.5" aria-hidden />
          )}
        </button>
      </td>
    </tr>
  );
}

function csvCell(v: string): string {
  // Quote if the value contains a comma, quote, or newline; escape quotes.
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
