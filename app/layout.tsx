import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { ServiceWorkerRegistrar } from "@/components/pwa/ServiceWorkerRegistrar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Business Builder Portal · By Workplaces",
  description:
    "Coaching, deliverables, and invoicing — one operating platform for the Workplaces practice.",
};

// Clerk components themed to the Business Builders palette.
const builderAppearance = {
  variables: {
    colorPrimary: "#2C6CB0",            // TBB blue (CTAs)
    colorBackground: "#F4F6F9",         // TBB bg-soft
    colorText: "#14181D",               // TBB ink
    colorTextSecondary: "#5A6470",      // TBB ink-3
    colorTextOnPrimaryBackground: "#FFFFFF",
    colorInputBackground: "#FFFFFF",
    colorInputText: "#14181D",
    fontFamily: "Arial, 'Helvetica Neue', Helvetica, system-ui, sans-serif",
    borderRadius: "0.625rem",           // 10px — TBB input radius
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider appearance={builderAppearance}>
      <html lang="en">
        <body className="font-sans antialiased">
          <ServiceWorkerRegistrar />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
