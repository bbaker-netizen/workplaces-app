/**
 * PDF markup and page editing, for one document.
 *
 * Business Builders only. `getMarkupDocument` runs through
 * `withEngagementContext`, so the per-Business-Builder client grants are
 * enforced before anything renders — a coach restricted to their own book
 * cannot open another coach's client document by pasting an id.
 *
 * The engagement in the URL is checked against the document's own engagement.
 * Without that, a document belonging to client A could be reached through
 * client B's URL by anyone allowed to see B, and the breadcrumb would name the
 * wrong client while the editor wrote to the right one.
 */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getMarkupDocument } from "@/lib/db/queries/document-annotations";
import { getEngagementByIdOrSlug } from "@/lib/db/queries/engagements";
import { getMyStampImage } from "@/lib/actions/pdf-editor";
import { PdfEditorLoader } from "@/components/pdf/PdfEditorLoader";
import { formatBytes } from "@/components/documents/utils";

// The document bytes and its markup are per-request state; nothing here is
// safely cacheable across users.
export const dynamic = "force-dynamic";

export default async function DocumentMarkupPage({
  params,
}: {
  params: { engagementId: string; documentId: string };
}) {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  const engagement = await getEngagementByIdOrSlug(params.engagementId);
  if (!engagement) notFound();

  const loaded = await getMarkupDocument(params.documentId);
  if (!loaded) notFound();
  // The document must belong to the engagement named in the URL.
  if (loaded.document.engagementId !== engagement.id) notFound();

  const isPdf =
    loaded.document.fileType.toLowerCase().includes("pdf") ||
    /\.pdf$/i.test(loaded.document.filename);

  const stamp = await getMyStampImage();

  const backHref = `/business-builder/documents/${params.engagementId}`;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground hover:text-tbb-blue"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          {engagement.name} documents
        </Link>
        <h1 className="font-display text-2xl sm:text-3xl text-foreground">
          {loaded.document.filename}
        </h1>
        <p className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
          Version {loaded.document.version} ·{" "}
          {formatBytes(loaded.document.sizeBytes)}
        </p>
      </div>

      {isPdf ? (
        <PdfEditorLoader
          documentId={loaded.document.id}
          engagementId={engagement.id}
          filename={loaded.document.filename}
          initialAnnotations={loaded.annotations}
          stampImage={stamp.ok ? stamp.data : null}
        />
      ) : (
        <div className="border border-tbb-line rounded-md bg-white p-6 space-y-2">
          <p className="font-sans text-sm text-foreground">
            This file isn&apos;t a PDF, so it can&apos;t be marked up here.
          </p>
          <Link
            href={`/api/documents/${loaded.document.id}/download`}
            className="font-sans text-sm text-tbb-blue hover:underline"
          >
            Download it instead
          </Link>
        </div>
      )}
    </div>
  );
}
