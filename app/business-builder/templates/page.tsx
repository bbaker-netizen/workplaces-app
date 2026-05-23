/**
 * /business-builder/templates — unified hub for everything reusable:
 *   - Email signature (appended to outgoing emails)
 *   - E-signature image (used when signing contracts)
 *   - Email templates (onboarding / contract / proposal / follow-up)
 *
 * Replaces the previous standalone /business-builder/profile/signature page which
 * Bruce found overkill. That route still exists for backward-compat
 * but the sidebar no longer links to it.
 */

import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  documentTemplates,
  emailTemplates,
  userProfiles,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { TemplatesManager } from "@/components/templates/TemplatesManager";
import { EmailSignatureEditor } from "@/components/templates/EmailSignatureEditor";
import { CoachSignatureManager } from "@/components/signing/CoachSignatureManager";
import { DocumentTemplatesManager } from "@/components/templates/DocumentTemplatesManager";

export default async function TemplatesPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  const [templates, docTemplates, me] = await Promise.all([
    withSystemContext(async (tx) =>
      tx
        .select()
        .from(emailTemplates)
        .where(eq(emailTemplates.orgId, profile.orgId))
        .orderBy(desc(emailTemplates.updatedAt)),
    ),
    withSystemContext(async (tx) =>
      tx
        .select()
        .from(documentTemplates)
        .where(eq(documentTemplates.orgId, profile.orgId))
        .orderBy(desc(documentTemplates.updatedAt)),
    ),
    withSystemContext(async (tx) => {
      const [u] = await tx
        .select({
          signatureImageData: userProfiles.signatureImageData,
          emailSignature: userProfiles.emailSignature,
        })
        .from(userProfiles)
        .where(eq(userProfiles.id, profile.userProfileId))
        .limit(1);
      return u ?? null;
    }),
  ]);

  return (
    <main className="max-w-5xl mx-auto px-6 py-12 space-y-10">
      <header className="space-y-1">
        <p className="tbb-eyebrow">Communications</p>
        <h1 className="text-tbb-h2 font-black text-tbb-navy tracking-tbb-tight">
          Templates &amp; signatures
        </h1>
        <p className="text-sm text-tbb-ink-3 max-w-2xl">
          Everything reusable lives here. Build it once, save yourself
          retyping it forever.
        </p>
      </header>

      <section className="space-y-3" id="email-signature">
        <div>
          <h2 className="text-xl font-bold text-tbb-navy">Email signature</h2>
          <p className="text-sm text-tbb-ink-3">
            Auto-appended to every email you send from a prospect or client
            page. Drop in your name, title, contact info, disclaimers — the
            stuff that&apos;s on every email out of Gmail.
          </p>
        </div>
        <EmailSignatureEditor initial={me?.emailSignature ?? ""} />
      </section>

      <section className="space-y-3" id="e-signature">
        <div>
          <h2 className="text-xl font-bold text-tbb-navy">
            E-signature for contracts
          </h2>
          <p className="text-sm text-tbb-ink-3">
            Upload a PNG or JPG of your handwritten signature. When you
            send a contract for signature and tick &quot;auto-sign as me&quot;,
            this image gets applied without you having to draw it each
            time.
          </p>
        </div>
        <CoachSignatureManager initial={me?.signatureImageData ?? null} />
      </section>

      <section className="space-y-3" id="email-templates">
        <div>
          <h2 className="text-xl font-bold text-tbb-navy">Email templates</h2>
          <p className="text-sm text-tbb-ink-3">
            Build your onboarding, contract, proposal, and follow-up emails
            once. Use them on any prospect or client — variables like{" "}
            <code className="px-1 py-0.5 bg-tbb-cream-50 rounded">{`{{company_name}}`}</code>{" "}
            and{" "}
            <code className="px-1 py-0.5 bg-tbb-cream-50 rounded">{`{{contact_first_name}}`}</code>{" "}
            fill in automatically.
          </p>
        </div>
        <TemplatesManager initialTemplates={templates} />
      </section>

      <section className="space-y-3" id="document-templates">
        <div>
          <h2 className="text-xl font-bold text-tbb-navy">
            Document templates (for signing)
          </h2>
          <p className="text-sm text-tbb-ink-3">
            The actual <strong>body</strong> of every contract, proposal,
            NDA, and renewal you send for signature. Write it in markdown
            with variable placeholders. When you hit{" "}
            <strong>Send for signature</strong> on a prospect or engagement,
            pick a template, the variables fill in, you edit anything
            specific to that deal, and we render the result as a
            Workplaces-branded PDF and route it through signing — no
            external Word doc / Adobe step in between.
          </p>
        </div>
        <DocumentTemplatesManager initialTemplates={docTemplates} />
      </section>
    </main>
  );
}
