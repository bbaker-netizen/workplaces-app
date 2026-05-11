import type { MetadataRoute } from "next";

/**
 * PWA manifest. Values per the Business Builders by Workplaces brand:
 * navy primary + cream background, full lockup name.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "The Business Builders by Workplaces",
    short_name: "Builders",
    description:
      "The Business Builders by Workplaces. Build what compounds.",
    start_url: "/portal",
    display: "standalone",
    background_color: "#EFE6D7",
    theme_color: "#14385B",
    icons: [
      {
        src: "/brand/logo-blue.png",
        sizes: "any",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
