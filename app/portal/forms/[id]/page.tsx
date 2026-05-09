import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getCurrentEngagement } from "@/lib/db/queries/engagements";
import {
  getForm,
  listFormSubmissions,
  type FormQuestion,
} from "@/lib/db/queries/forms";
import { FormBuilder } from "@/components/forms/FormBuilder";
import { FormResponder } from "@/components/forms/FormResponder";

export default async function FormDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  const engagement = await getCurrentEngagement();
  if (!engagement) redirect("/portal");

  const form = await getForm(params.id);
  if (!form) notFound();

  const canEdit =
    profile.role === "master_admin" ||
    profile.role === "coach" ||
    profile.role === "client_lead" ||
    profile.role === "client_manager";
  const submissions = canEdit ? await listFormSubmissions(form.id) : [];

  const schema = (form.schema as FormQuestion[]) ?? [];

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-10">
      <header className="space-y-2">
        <Link
          href="/portal/forms"
          className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
        >
          ← All forms
        </Link>
        <h1 className="font-display font-bold text-foreground text-3xl sm:text-4xl tracking-tight leading-none">
          {form.name}
        </h1>
        {form.description && (
          <p className="font-sans text-sm text-muted-foreground">
            {form.description}
          </p>
        )}
      </header>

      {form.isActive && (
        <FormResponder formId={form.id} questions={schema} />
      )}

      {canEdit && (
        <>
          <section className="space-y-3">
            <h2 className="font-display font-bold text-foreground text-xl tracking-tight">
              Edit
            </h2>
            <FormBuilder
              engagementId={engagement.id}
              initial={{
                id: form.id,
                name: form.name,
                description: form.description ?? "",
                type: form.type,
                schema,
                isActive: form.isActive,
              }}
              redirectTo="/portal/forms"
              showDelete
            />
          </section>

          <section className="space-y-3">
            <h2 className="font-display font-bold text-foreground text-xl tracking-tight">
              Responses ({submissions.length})
            </h2>
            {submissions.length === 0 ? (
              <p className="font-sans text-sm text-muted-foreground italic">
                Nothing yet.
              </p>
            ) : (
              <ul className="divide-y divide-[#CCCCCC] border-t border-b border-[#CCCCCC]">
                {submissions.map((s) => (
                  <li key={s.id} className="py-3 space-y-2">
                    <div className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                      {s.submittedAt.toLocaleString()}
                      {s.respondentName && <> · {s.respondentName}</>}
                      {s.respondentEmail && <> · {s.respondentEmail}</>}
                    </div>
                    <pre className="font-mono text-xs whitespace-pre-wrap bg-[#F5F1E8] border border-[#CCCCCC] rounded-md px-3 py-2 overflow-x-auto">
                      {JSON.stringify(s.answers, null, 2)}
                    </pre>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
