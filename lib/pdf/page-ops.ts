/**
 * Page operations — delete, reorder, rotate, extract.
 *
 * The deterministic half of "edit a PDF": everything that changes which pages
 * exist and which way up they are, without touching page content. Lossless,
 * fast, and the operations Acrobat is most often opened for.
 *
 * Pages are 1-BASED throughout the public API, because that is how every PDF
 * tool and every person counts them. Converting to zero-based indices happens
 * at exactly one point, inside each operation.
 *
 * DELETE AND ROTATE MUTATE IN PLACE; REORDER AND EXTRACT REBUILD.
 * In-place preserves everything pdf-lib does not model — form fields,
 * outlines, links, embedded files — so it is used wherever it can be. There is
 * no in-place reorder in pdf-lib, so those two copy pages into a fresh
 * document, which does drop document-level extras. That trade is stated in
 * `rebuilds()` so a caller can warn before doing it.
 */

import { PDFDocument, degrees } from "pdf-lib";

// Re-exported so server callers have one import for page work. The parser
// itself lives in a pdf-lib-free module so the browser editor can use it too.
export { parsePageRange } from "./ranges";

export type PageOp =
  | { type: "delete"; pages: number[] }
  | { type: "rotate"; pages: number[]; turn: 90 | 180 | 270 }
  | { type: "reorder"; order: number[] }
  | { type: "extract"; pages: number[] };

/** Whether an op rebuilds the document, dropping form fields and outlines. */
export function rebuilds(op: PageOp): boolean {
  return op.type === "reorder" || op.type === "extract";
}

export type PageOpsResult = {
  bytes: Uint8Array;
  pageCount: number;
};

export async function applyPageOps(
  sourceBytes: ArrayBuffer | Uint8Array,
  ops: PageOp[],
): Promise<PageOpsResult> {
  let current =
    sourceBytes instanceof Uint8Array
      ? sourceBytes
      : new Uint8Array(sourceBytes);

  // Sequential, re-loading between ops. Page numbers in op N+1 refer to the
  // document AS IT IS AFTER op N, which is what a person means when they say
  // "delete page 3, then rotate page 3".
  for (const op of ops) {
    current = await applyOne(current, op);
  }

  const finalDoc = await PDFDocument.load(current, { ignoreEncryption: true });
  return { bytes: current, pageCount: finalDoc.getPageCount() };
}

async function applyOne(
  bytes: Uint8Array,
  op: PageOp,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const count = pdf.getPageCount();

  switch (op.type) {
    case "delete": {
      const targets = validPages(op.pages, count);
      if (targets.length === 0) throw new Error("No valid pages to delete.");
      if (targets.length >= count) {
        // A zero-page PDF is not a document; pdf-lib will happily produce one
        // and every viewer then reports the file as corrupt.
        throw new Error("Cannot delete every page.");
      }
      // Descending, so each removal cannot shift the index of the next.
      for (const p of [...targets].sort((a, b) => b - a)) {
        pdf.removePage(p - 1);
      }
      return await pdf.save();
    }

    case "rotate": {
      const targets = validPages(op.pages, count);
      if (targets.length === 0) throw new Error("No valid pages to rotate.");
      for (const p of targets) {
        const page = pdf.getPage(p - 1);
        // Additive: rotating an already-rotated page turns it further, which
        // is what pressing the button twice should do.
        const next = (((page.getRotation().angle + op.turn) % 360) + 360) % 360;
        page.setRotation(degrees(next));
      }
      return await pdf.save();
    }

    case "reorder": {
      const order = op.order.filter(
        (p) => Number.isInteger(p) && p >= 1 && p <= count,
      );
      const unique = Array.from(new Set(order));
      if (unique.length !== count) {
        // Refusing a partial order is deliberate. Silently keeping the pages
        // the caller forgot would produce a document that is neither the
        // requested order nor the original, and the loss would not be
        // noticed until someone read the file.
        throw new Error(
          `A reorder must list every page exactly once (${count} expected, ${unique.length} given).`,
        );
      }
      const out = await PDFDocument.create();
      const copied = await out.copyPages(
        pdf,
        unique.map((p) => p - 1),
      );
      copied.forEach((page) => out.addPage(page));
      return await out.save();
    }

    case "extract": {
      const targets = validPages(op.pages, count);
      if (targets.length === 0) throw new Error("No valid pages to extract.");
      const out = await PDFDocument.create();
      const copied = await out.copyPages(
        pdf,
        // Ascending, so an extract always reads in document order.
        [...targets].sort((a, b) => a - b).map((p) => p - 1),
      );
      copied.forEach((page) => out.addPage(page));
      return await out.save();
    }
  }
}

/** Whole numbers within range, de-duplicated. Out-of-range pages are dropped. */
function validPages(pages: number[], count: number): number[] {
  const seen = new Set<number>();
  for (const p of pages) {
    if (Number.isInteger(p) && p >= 1 && p <= count) seen.add(p);
  }
  return Array.from(seen);
}

/** Page count without a full parse of anything else. Used for UI validation. */
export async function pageCountOf(
  bytes: ArrayBuffer | Uint8Array,
): Promise<number> {
  const pdf = await PDFDocument.load(
    bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
    { ignoreEncryption: true },
  );
  return pdf.getPageCount();
}

