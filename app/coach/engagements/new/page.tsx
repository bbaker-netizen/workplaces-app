import { EngagementForm } from "./EngagementForm";

export default function NewEngagementPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-16">
      <div className="max-w-2xl mx-auto space-y-10">
        <header className="space-y-3">
          <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
            Coach Console
          </p>
          <h1 className="font-bold text-foreground text-4xl sm:text-5xl tracking-tight leading-none">
            New engagement
          </h1>
          <p className="font-sans text-muted-foreground max-w-md leading-relaxed">
            Creates a Clerk Organization, an app-side engagement record, and
            sends the client lead an invitation email. They&apos;ll land in
            their portal as a client lead when they accept.
          </p>
        </header>
        <EngagementForm />
      </div>
    </main>
  );
}
