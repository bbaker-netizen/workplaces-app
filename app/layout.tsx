import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Builder · By Workplaces",
  description:
    "The complete operational layer for Workplaces coaching engagements.",
};

// Clerk components themed to The Builder palette.
// See CLAUDE.md "Brand & UI" for the canonical spec.
const builderAppearance = {
  variables: {
    colorPrimary: "#1A1A1A",            // Foreman Black
    colorBackground: "#F5F1E8",          // Drafting Cream
    colorText: "#1A1A1A",
    colorTextSecondary: "#666666",
    colorTextOnPrimaryBackground: "#F5F1E8",
    colorInputBackground: "#FFFFFF",
    colorInputText: "#1A1A1A",
    fontFamily: '"Work Sans", system-ui, sans-serif',
    borderRadius: "0.375rem",
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
        <body className="font-sans antialiased">{children}</body>
      </html>
    </ClerkProvider>
  );
}
