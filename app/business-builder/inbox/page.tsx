/**
 * Coach inbox — unified external-communications log.
 *
 * Shows every email / SMS / WhatsApp / phone-call note across every
 * prospect and engagement in the master org. Search + channel filter +
 * tag filter at the top. Each row links into the source record so
 * follow-up actions stay one click away.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Mail,
  MessageSquare,
  Phone,
  StickyNote,
  Smartphone,
} from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { orgs } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import {
  listInbox,
  listKnownTags,
  type CommunicationRow,
} from "@/lib/db/queries/client-communications";
import { listComposeContacts } from "@/lib/db/queries/contact-search";
import { InboxFilters } from "@/components/inbox/InboxFilters";
import { InboxReplyButton } from "@/components/inbox/InboxReplyComposer";
import { InboxComposeNewButton } from "@/components/inbox/InboxComposeNewButton";

export default async function CoachInboxPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    channel?: string;
    direction?: string;
    tag?: string;
  }>;
}) {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  // Look up the master org so we can scope queries to it (Business Builder side
  // queries always operate against the master org's records).
  const masterOrgId = await withSystemContext(async (tx) => {
    const [m] = await tx
      .select({ id: orgs.id })
      .from(orgs)
      .where(eq(orgs.type, "master"))
      .limit(1);
    return m?.id ?? profile.orgId;
  });

  const sp = await searchParams;
  const filters = {
    q: sp.q ?? undefined,
    channel:
      sp.channel && sp.channel !== "all"
        ? (sp.channel as CommunicationRow["channel"])
        : null,
    direction:
      sp.direction && sp.direction !== "all"
        ? (sp.direction as CommunicationRow["direction"])
        : null,
    tag: sp.tag && sp.tag.length > 0 ? sp.tag : null,
  };

  const [rows, knownTags, contacts] = await Promise.all([
    listInbox(masterOrgId, filters),
    listKnownTags(masterOrgId),
    listComposeContacts(),
  ]);

  return (
    <main className="max-w-6xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-1 flex items-end justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <p className="tbb-eyebrow">External communications</p>
          <h1 className="text-tbb-h2 font-black text-tbb-navy tracking-tbb-tight">
            Inbox
          </h1>
          <p className="text-sm text-tbb-ink-3">
            Every email, text, WhatsApp message, and call note captured
            across your prospects and active clients. Searchable, taggable,
            and replyable through your connected Gmail.
          </p>
        </div>
        <InboxComposeNewButton contacts={contacts} />
      </header>

      <InboxFilters knownTags={knownTags} currentFilters={filters} />

      <div className="border border-tbb-line rounded-lg bg-white shadow-tbb-sm overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <div className="text-5xl" aria-hidden>
              📭
            </div>
            <p className="font-bold text-tbb-navy text-lg">
              Inbox zero — the cleanest kind of empty.
            </p>
            <p className="text-sm text-tbb-ink-3 max-w-md mx-auto">
              Once you start emailing or texting prospects (or they reply
              back), every message lands here automatically. Until then,
              go enjoy the quiet.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-tbb-line-soft">
            {rows.map((r) => (
              <CommunicationRowItem key={r.id} row={r} />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function CommunicationRowItem({ row }: { row: CommunicationRow }) {
  const icon = iconForChannel(row.channel);
  const target = row.prospectId
    ? `/business-builder/pipeline/${row.prospectId}`
    : row.engagementId
      ? `/business-builder/communication/${row.engagementId}`
      : "/business-builder";
  const label = row.prospectName ?? row.engagementName ?? "Unattached";
  const directionIcon =
    row.direction === "inbound" ? (
      <ArrowDownLeft className="w-3 h-3 text-tbb-success" aria-hidden />
    ) : (
      <ArrowUpRight className="w-3 h-3 text-tbb-blue" aria-hidden />
    );
  const preview = (row.body || row.subject || "").slice(0, 200);
  return (
    <li className="px-5 py-3 hover:bg-tbb-cream-50 flex items-start gap-3">
      <Link
        href={target}
        className="flex items-start gap-3 flex-1 min-w-0"
        aria-label={`Open ${label} in ${row.channel}`}
      >
        <span className="shrink-0 mt-0.5 grid place-items-center w-8 h-8 rounded-md bg-tbb-cream-50 text-tbb-ink-3">
          {icon}
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-tbb-navy">{label}</span>
            {directionIcon}
            <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              {row.channel.replace("_", " ")}
            </span>
            <span className="text-[11px] text-tbb-ink-3 whitespace-nowrap ml-auto">
              {row.occurredAt.toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          </span>
          {row.subject && (
            <span className="block text-sm text-tbb-ink-2 truncate mt-0.5">
              {row.subject}
            </span>
          )}
          <span className="block text-sm text-tbb-ink-3 line-clamp-2 mt-0.5">
            {preview}
          </span>
          {row.tags.length > 0 && (
            <span className="mt-1 flex flex-wrap gap-1">
              {row.tags.map((t) => (
                <span
                  key={t}
                  className="inline-block bg-tbb-blue-100 text-tbb-blue-700 text-[10px] font-bold uppercase tracking-tbb-caps px-1.5 py-0.5 rounded-pill"
                >
                  {t}
                </span>
              ))}
            </span>
          )}
        </span>
      </Link>
      <span className="shrink-0 self-center">
        <InboxReplyButton
          row={{
            id: row.id,
            channel: row.channel,
            direction: row.direction,
            fromAddress: row.fromAddress,
            toAddresses: row.toAddresses,
            subject: row.subject,
            body: row.body,
            externalId: row.externalId,
            threadKey: row.threadKey,
            prospectId: row.prospectId,
            engagementId: row.engagementId,
            prospectName: row.prospectName,
            engagementName: row.engagementName,
            occurredAt: row.occurredAt,
          }}
        />
      </span>
    </li>
  );
}

function iconForChannel(
  channel: CommunicationRow["channel"],
): React.ReactNode {
  switch (channel) {
    case "email":
      return <Mail className="w-4 h-4" aria-hidden />;
    case "sms":
      return <Smartphone className="w-4 h-4" aria-hidden />;
    case "whatsapp":
      return <MessageSquare className="w-4 h-4" aria-hidden />;
    case "phone_call":
      return <Phone className="w-4 h-4" aria-hidden />;
    case "meeting_note":
    case "other":
    default:
      return <StickyNote className="w-4 h-4" aria-hidden />;
  }
}
