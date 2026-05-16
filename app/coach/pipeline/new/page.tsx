/**
 * Manual "Add prospect" form — Phase 5 CRM. For when a Business
 * Builder wants to add a lead by hand (not waiting for the web form
 * or diagnostic submission to fire it in).
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { NewProspectForm } from "@/components/pipeline/NewProspectForm";

export default async function NewProspectPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-2">
        <Link
          href="/coach/pipeline"
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
        >
          <ArrowLeft className="w-3 h-3" aria-hidden /> Pipeline
        </Link>
        <p className="tbb-eyebrow">Add a prospect</p>
        <h1 className="text-tbb-h2 font-bold text-tbb-navy tracking-tbb-tight">
          New prospect
        </h1>
        <p className="text-sm text-tbb-ink-3">
          Add a lead by hand. For automatic capture, point your web form at{" "}
          <code className="font-mono text-xs">/api/leads</code> instead.
        </p>
      </header>
      <NewProspectForm />
    </main>
  );
}
