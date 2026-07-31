"use client";

/**
 * Client-only boundary for the PDF editor.
 *
 * `ssr: false` is required, not cosmetic. pdf.js touches `window`,
 * `DOMMatrix` and a Web Worker at import time, none of which exist during a
 * server render — and there is nothing useful to render on the server anyway,
 * since the document is fetched from the browser through the authenticated
 * download route.
 *
 * The dynamic import also keeps pdf.js out of every other page's bundle. It is
 * over a megabyte with its worker, which is the same reason the emoji picker
 * was lazy-loaded in Phase 1.3.5.
 */

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import type { MarkupAnnotation } from "@/lib/pdf/annotations";

const PdfMarkupEditor = dynamic(
  () => import("./PdfMarkupEditor").then((m) => m.PdfMarkupEditor),
  {
    ssr: false,
    loading: () => (
      <div className="grid place-items-center h-64 border border-tbb-line rounded-md bg-white">
        <span className="inline-flex items-center gap-2 font-sans text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading the editor…
        </span>
      </div>
    ),
  },
);

export function PdfEditorLoader(props: {
  documentId: string;
  engagementId: string;
  filename: string;
  initialAnnotations: MarkupAnnotation[];
  stampImage: string | null;
}) {
  return <PdfMarkupEditor {...props} />;
}
