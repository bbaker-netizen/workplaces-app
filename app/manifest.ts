import type { MetadataRoute } from "next";

/**
 * PWA manifest. Phase 3.2. Values per CLAUDE.md "Brand & UI" section.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "The Builder",
    short_name: "Builder",
    description:
      "The Builder · By Workplaces. Build what compounds.",
    start_url: "/portal",
    display: "standalone",
    background_color: "#F5F1E8",
    theme_color: "#1A1A1A",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
