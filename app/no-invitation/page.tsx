import { SignOutButton } from "@clerk/nextjs";

export default function NoInvitationPage() {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-6 py-20">
      <div className="flex flex-col items-center gap-6 text-center max-w-2xl">
        <h1 className="font-bold text-foreground tracking-tight text-4xl sm:text-5xl leading-none">
          Invitation required
        </h1>
        <p className="font-sans text-muted-foreground max-w-md leading-relaxed">
          Business Builder Portal is invitation-only. If you&apos;re expecting access,
          your Coach should have sent you an invitation email — check your
          inbox (and spam) for a message from Clerk.
        </p>
        <p className="font-sans text-muted-foreground max-w-md leading-relaxed text-sm">
          If you believe this is an error, contact{" "}
          <a
            href="mailto:bbaker@4workplaces.com"
            className="font-mono underline underline-offset-4 hover:text-foreground"
          >
            bbaker@4workplaces.com
          </a>
          .
        </p>
        <SignOutButton redirectUrl="/">
          <button className="mt-8 font-sans text-xs uppercase tracking-tbb-caps text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline">
            Sign out
          </button>
        </SignOutButton>
      </div>
    </main>
  );
}
