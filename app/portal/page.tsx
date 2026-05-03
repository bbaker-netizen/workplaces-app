import { redirect } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { ensureUserProfile } from "@/lib/db/provisioning";

export default async function PortalPage() {
  const result = await ensureUserProfile();

  if (result.status === "no_invitation") {
    redirect("/no-invitation");
  }

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-6 py-20">
      <div className="flex flex-col items-center gap-4 text-center max-w-2xl">
        <h1 className="font-display font-bold text-foreground tracking-tight text-4xl sm:text-6xl leading-none">
          Welcome, {result.fullName}
        </h1>
        <p className="font-sans text-muted-foreground">
          Signed in as <span className="font-mono">{result.email}</span>
        </p>
        <div className="font-mono text-xs text-muted-foreground pt-12 space-y-1">
          <p>org: {result.orgId}</p>
          <p>role: {result.role}</p>
        </div>
        <SignOutButton redirectUrl="/">
          <button className="mt-12 font-sans text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline">
            Sign out
          </button>
        </SignOutButton>
      </div>
    </main>
  );
}
