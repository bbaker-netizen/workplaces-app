-- Which font a replaced line of text should be rendered in.
--
-- The first cut of the Edit text tool always retyped in Helvetica, which makes
-- an edit obvious the moment the surrounding document is set in anything else
-- — and client contracts are usually Times. pdf.js hands back a font family
-- per text run, so the editor can now pick the closest standard font, but the
-- choice has to survive to the export or the burn step would fall back to
-- Helvetica again and undo the whole point.
--
-- A short key rather than a family + two booleans: the value is only ever one
-- of twelve standard-font names, it is written and read whole, and one column
-- cannot get into a state where "bold" is set on a font that has no bold.
-- NULL means Helvetica regular, which is what every mark written before this
-- migration is, so no backfill is needed.
ALTER TABLE document_annotations
  ADD COLUMN IF NOT EXISTS font text;
