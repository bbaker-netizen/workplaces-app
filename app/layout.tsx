import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Builder · By Workplaces",
  description:
    "The complete operational layer for Workplaces coaching engagements.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
