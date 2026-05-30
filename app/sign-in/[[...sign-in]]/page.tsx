import { SignIn } from "@clerk/nextjs";

export default function Page() {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-6 py-12">
      {/* Land on the /home dispatcher, which routes coaches to their
          console and clients to their portal in one hop. */}
      <SignIn fallbackRedirectUrl="/home" />
    </main>
  );
}
