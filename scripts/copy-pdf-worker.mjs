/**
 * Put pdf.js's worker where the browser can fetch it.
 *
 * WHY THIS EXISTS RATHER THAN A BUNDLER IMPORT. The obvious approach —
 * `new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url)` — does
 * make webpack emit the file, and then the build fails: Terser minifies the
 * emitted asset and parses it as a classic script, so the worker's
 * `import.meta` and top-level `import` are syntax errors.
 *
 *   static/media/pdf.worker.min.<hash>.mjs from Terser
 *     x 'import.meta' cannot be used outside of module code.
 *
 * Files in `public/` are served verbatim and never touched by webpack or
 * Terser, which sidesteps the whole problem. Copying (rather than committing
 * the file) keeps the worker pinned to the installed pdfjs-dist version — a
 * worker from a different version than the library fails at parse time with an
 * unhelpful error, so drift here is worth designing out.
 *
 * Runs from `prebuild` and `predev`. The copy is skipped when the destination
 * is already current, so it costs nothing on repeat runs.
 */

import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(
  root,
  "node_modules",
  "pdfjs-dist",
  "build",
  "pdf.worker.min.mjs",
);
const destination = join(root, "public", "pdf.worker.min.mjs");

if (!existsSync(source)) {
  // Not fatal. A build that cannot find the worker should still produce a
  // deployable site; the PDF editor is one page, and it surfaces its own
  // "couldn't be opened" error rather than taking the app down.
  console.warn(
    "[copy-pdf-worker] pdfjs-dist not installed — skipping. The PDF editor will not load until dependencies are installed.",
  );
  process.exit(0);
}

mkdirSync(dirname(destination), { recursive: true });

const sourceStat = statSync(source);
if (existsSync(destination)) {
  const destStat = statSync(destination);
  if (
    destStat.size === sourceStat.size &&
    destStat.mtimeMs >= sourceStat.mtimeMs
  ) {
    process.exit(0);
  }
}

copyFileSync(source, destination);
console.log(
  `[copy-pdf-worker] public/pdf.worker.min.mjs updated (${Math.round(sourceStat.size / 1024)} KB).`,
);
