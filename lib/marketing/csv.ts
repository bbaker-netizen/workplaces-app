/**
 * Small, correct CSV parsing for the marketing-list import.
 *
 * Formidable Forms exports entries as CSV. We parse it ourselves (RFC-4180:
 * quoted fields, escaped "" quotes, commas + newlines inside quotes, CRLF)
 * rather than pulling in a dependency — and rather than the naive
 * split-on-comma that mangled phone/date columns on the earlier import.
 *
 * Then we auto-detect which columns are name / email / phone / company by
 * their header names, so Bruce doesn't have to map fields by hand.
 */

export type ParsedRow = {
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
};

export type CsvParseResult = {
  headers: string[];
  rows: ParsedRow[];
  /** Which source header we mapped to each field (for the preview UI). */
  mapping: {
    name: string | null;
    email: string | null;
    phone: string | null;
    company: string | null;
  };
};

/** Split raw CSV text into a grid of string cells. */
export function parseCsvGrid(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  // Strip a UTF-8 BOM if present (Excel / some exporters add one).
  let i = 0;
  if (text.charCodeAt(0) === 0xfeff) i = 1;

  for (; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++; // skip the escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      // Handle CRLF as a single break; swallow the paired char.
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  // Flush the last field/row if the file didn't end with a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully-empty trailing rows.
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function findHeader(headers: string[], needles: string[]): number {
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (let i = 0; i < lower.length; i++) {
    if (needles.some((n) => lower[i].includes(n))) return i;
  }
  return -1;
}

/**
 * Parse a Formidable (or any) CSV export into name/email/phone/company rows.
 * Auto-detects columns by header. First + last name headers are combined.
 */
export function parseMarketingCsv(text: string): CsvParseResult {
  const grid = parseCsvGrid(text);
  if (grid.length === 0) {
    return {
      headers: [],
      rows: [],
      mapping: { name: null, email: null, phone: null, company: null },
    };
  }
  const headers = grid[0].map((h) => h.trim());

  const emailIdx = findHeader(headers, ["e-mail", "email"]);
  const phoneIdx = findHeader(headers, ["phone", "mobile", "cell", "tel"]);
  const companyIdx = findHeader(headers, [
    "company",
    "business",
    "organization",
    "organisation",
  ]);
  const firstIdx = findHeader(headers, ["first name", "first"]);
  const lastIdx = findHeader(headers, ["last name", "last", "surname"]);
  // A "full name" column is one that mentions name/contact but ISN'T the
  // first-name or last-name column (otherwise "First Name" would win and we'd
  // drop the surname).
  const lower = headers.map((h) => h.trim().toLowerCase());
  const nameIdx = lower.findIndex(
    (h, i) =>
      i !== firstIdx &&
      i !== lastIdx &&
      (h.includes("full name") || h.includes("name") || h.includes("contact")),
  );

  // Prefer an explicit full-name column; otherwise stitch first + last.
  const useSplitName = nameIdx === -1 && (firstIdx !== -1 || lastIdx !== -1);

  const cell = (r: string[], idx: number) =>
    idx >= 0 && idx < r.length ? r[idx].trim() : "";

  const rows: ParsedRow[] = grid.slice(1).map((r) => {
    let name: string | null = null;
    if (useSplitName) {
      const combined = [cell(r, firstIdx), cell(r, lastIdx)]
        .filter(Boolean)
        .join(" ")
        .trim();
      name = combined || null;
    } else {
      name = cell(r, nameIdx) || null;
    }
    return {
      name,
      email: (cell(r, emailIdx) || "").toLowerCase() || null,
      phone: cell(r, phoneIdx) || null,
      company: cell(r, companyIdx) || null,
    };
  });

  return {
    headers,
    rows,
    mapping: {
      name: useSplitName
        ? [headers[firstIdx], headers[lastIdx]].filter(Boolean).join(" + ")
        : nameIdx >= 0
          ? headers[nameIdx]
          : null,
      email: emailIdx >= 0 ? headers[emailIdx] : null,
      phone: phoneIdx >= 0 ? headers[phoneIdx] : null,
      company: companyIdx >= 0 ? headers[companyIdx] : null,
    },
  };
}

/** A row is importable only if it has a syntactically valid email. */
export function isImportableEmail(email: string | null): email is string {
  return Boolean(email && EMAIL_RE.test(email));
}
