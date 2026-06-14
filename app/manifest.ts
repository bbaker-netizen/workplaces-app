import type { MetadataRoute } from "next";

/**
 * PWA manifest. Values per the Business Builders by Workplaces brand:
 * navy primary + cream background, full lockup name.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Business Builder Portal · By Workplaces",
    short_name: "Portal",
    description:
      "Business Builder Portal by Workplaces. Build what compounds.",
    start_url: "/portal",
    display: "standalone",
    background_color: "#EFE6D7",
    theme_color: "#14385B",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
