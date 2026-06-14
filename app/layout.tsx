import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import NextTopLoader from "nextjs-toploader";
import { ServiceWorkerRegistrar } from "@/components/pwa/ServiceWorkerRegistrar";
import { PageTransition } from "@/components/layout/PageTransition";
import { NavLoaderOverlay } from "@/components/layout/NavLoaderOverlay";
import "./globals.css";

// Absolute base for OpenGraph / Twitter image URLs. The
// app/opengraph-image.png + app/twitter-image.png files are picked up by
// Next's file convention and emitted as <meta og:image> / <meta
// twitter:image> automatically — metadataBase makes those URLs absolute
// so link unfurls (Slack, iMessage, LinkedIn, X) resolve the image
// without any manual upload.
const siteUrl =
  process.env.NEXT_PUBLIC_APP_URL ??
  "https://workplaces-the-builder.netlify.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Business Builder Portal · By Workplaces",
  description:
    "Coaching, deliverables, and invoicing — one operating platform for the Workplaces practice.",
  openGraph: {
    title: "The Builder · By Workplaces",
    description:
      "Coaching, deliverables, and invoicing — one operating platform for the Workplaces practice.",
    siteName: "The Builder",
    type: "website",
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: "The Builder · By Workplaces",
    description:
      "Coaching, deliverables, and invoicing — one operating platform for the Workplaces practice.",
  },
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
          {/* Global top progress bar — animates on every page
              navigation so the user sees the system is working. */}
          <NextTopLoader
            color="#CC6A20"
            height={3}
            showSpinner={false}
            shadow="0 0 8px rgba(204, 106, 32, 0.4)"
          />
          <ServiceWorkerRegistrar />
          <NavLoaderOverlay />
          <PageTransition>{children}</PageTransition>
        </body>
      </html>
    </ClerkProvider>
  );
}
