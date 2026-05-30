import { SignUp } from "@clerk/nextjs";

export default function Page() {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-6 py-12">
      {/* Same dispatcher as sign-in — route by role in one hop. */}
      <SignUp fallbackRedirectUrl="/home" />
    </main>
  );
}
