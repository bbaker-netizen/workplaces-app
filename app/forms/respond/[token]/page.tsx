/**
 * Public form respond page.
 *
 * Phase 2.8. Anonymous, no Clerk required. Looks up the form by
 * public_token and renders the form. Submission goes through the
 * `submitPublicForm` server action.
 */

import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { forms } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { PublicFormResponder } from "@/components/forms/PublicFormResponder";
import type { FormQuestion } from "@/lib/db/queries/forms";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function PublicFormRespondPage({
  params,
}: {
  params: { token: string };
}) {
  const form = await withSystemContext(async (tx) => {
    const [row] = await tx
      .select({
        id: forms.id,
        name: forms.name,
        description: forms.description,
        type: forms.type,
        schema: forms.schema,
        isActive: forms.isActive,
        publicToken: forms.publicToken,
      })
      .from(forms)
      .where(eq(forms.publicToken, params.token))
      .limit(1);
    return row ?? null;
  });

  if (!form || !form.isActive) notFound();

  const questions = (form.schema as FormQuestion[]) ?? [];

  return (
    <main className="min-h-screen bg-background py-12 px-6">
      <div className="max-w-2xl mx-auto space-y-8">
        <header className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
            The Builder · By Workplaces
          </p>
          <h1 className="font-display font-bold text-foreground text-3xl sm:text-4xl tracking-tight leading-none">
            {form.name}
          </h1>
          {form.description && (
            <p className="font-sans text-base text-muted-foreground">
              {form.description}
            </p>
          )}
        </header>

        <div className="border border-[#CCCCCC] rounded-md bg-white p-6">
          <PublicFormResponder
            token={form.publicToken!}
            questions={questions}
          />
        </div>

        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground text-center">
          Workplaces · Build what compounds.
        </p>
      </div>
    </main>
  );
}
