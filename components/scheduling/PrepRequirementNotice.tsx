/**
 * The pre-work block, rendered the same way everywhere it appears.
 *
 * "Where the money went" is ninety minutes reading a prospect's own
 * numbers, and it does not work if the numbers never arrive. So the
 * requirement is not a line in a description a Builder can edit away and
 * not a sentence at the bottom of a confirmation — it is a bordered
 * block, above the thing the visitor came to do, on the booking page,
 * the confirmation page, and in the confirmation email.
 *
 * A server component: pure markup, no state, so it costs no client JS on
 * a public page.
 */

import { FileText } from "lucide-react";
import type { PrepRequirement } from "@/lib/booking/meeting-types";

export function PrepRequirementNotice({
  prep,
  /** Shown after the timing line — e.g. where to send them. */
  footnote,
}: {
  prep: PrepRequirement;
  footnote?: string;
}) {
  return (
    <section
      // Heavier than every other card on these pages — a two-pixel rule
      // and the deeper cream, rather than the white-on-hairline used for
      // information. This is the one thing on the page the visitor has to
      // act on, so it should not look like the rest of it.
      className="border-2 border-tbb-navy rounded-md bg-tbb-cream p-5 space-y-3"
      aria-labelledby="prep-headline"
    >
      <div className="flex items-start gap-2.5">
        <FileText className="w-5 h-5 text-tbb-navy shrink-0 mt-0.5" aria-hidden />
        <div className="space-y-1">
          <h2
            id="prep-headline"
            className="font-bold text-foreground text-lg tracking-tight leading-snug"
          >
            {prep.headline}
          </h2>
          <p className="font-sans text-sm text-foreground">{prep.why}</p>
        </div>
      </div>

      <ul className="space-y-2 border-t border-tbb-line pt-3">
        {prep.items.map((item) => (
          <li
            key={item}
            className="font-sans text-sm text-foreground flex items-start gap-2"
          >
            <span className="text-tbb-navy font-bold shrink-0" aria-hidden>
              •
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <p className="font-sans text-sm text-muted-foreground border-t border-tbb-line pt-3">
        {prep.timing}
        {footnote ? ` ${footnote}` : ""}
      </p>
    </section>
  );
}
