/**
 * The Climb — meeting prep kit. A single curated place a Business Builder
 * opens before a prospect meeting: the interactive Climb app plus its
 * companion documents, so there's no hunting for templates.
 *
 * The app URL is filled in once Bruce deploys The Climb. Until then the
 * kit still serves the companion documents; the launch card shows a
 * "coming soon" state. An env override is supported so the URL can be set
 * without a code change.
 */

export const THE_CLIMB_URL =
  process.env.NEXT_PUBLIC_THE_CLIMB_URL?.trim() ||
  "https://workplaces-the-climb.netlify.app/";

export type ClimbCompanionTool = {
  title: string;
  description: string;
  /** Path under /public. */
  file: string;
};

/** Companion documents bundled with the app and served from /public. Add
 *  more here (e.g. the third doc) and they appear on the kit automatically. */
export const CLIMB_COMPANION_TOOLS: ClimbCompanionTool[] = [
  {
    title: "The Climb — One-Pager",
    description:
      "The framework at a glance: the Map of the Mountain and the four Building Blocks. Skim it right before you walk in.",
    file: "/prep-kit/the-climb-one-pager.pdf",
  },
  {
    title: "4 Building Blocks — Assessment",
    description:
      "Score the prospect across the four Building Blocks to focus the conversation on what matters most.",
    file: "/prep-kit/4-building-blocks-assessment.pdf",
  },
];
