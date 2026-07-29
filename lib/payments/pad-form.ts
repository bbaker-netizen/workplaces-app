/**
 * Pre-Authorized Debit (PAD) authorization — the fields, the required
 * wording, and the rendered form.
 *
 * The field list is NOT configurable. A PAD agreement's contents are
 * prescribed by the Payments Canada Rule H1 framework, not chosen per
 * practice, so a form builder here would only offer the chance to leave
 * out something a bank requires. Fixed and correct beats flexible.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT HANDLE: credit cards. Card numbers
 * are never collected by this application — the practice links its hosted
 * payment page instead, so card data goes straight to the processor. A
 * form here would put card numbers in our database and drag a coaching
 * practice into PCI obligations it has no reason to carry.
 *
 * Bruce: have the bank (or Jen) read the wording below once before the
 * first live use. It carries the standard Rule H1 clauses — cancellation
 * on 10 days' notice, waiver of pre-notification, and the recourse
 * statement — but a bank occasionally asks for its own phrasing.
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type PadFieldKey =
  | "account_holder"
  | "institution_name"
  | "institution_number"
  | "transit_number"
  | "account_number"
  | "account_type"
  | "authorization_type";

export type PadField = {
  key: PadFieldKey;
  label: string;
  hint?: string;
  /** Encrypted at rest and never rendered back into the console. */
  sensitive: boolean;
  /** Fixed-length numeric fields the bank will reject if malformed. */
  digits?: number;
  options?: string[];
};

export const PAD_FIELDS: PadField[] = [
  {
    key: "account_holder",
    label: "Name on the account",
    hint: "Exactly as it appears at your financial institution",
    sensitive: false,
  },
  {
    key: "institution_name",
    label: "Financial institution",
    hint: "e.g. RBC, ATB Financial",
    sensitive: false,
  },
  {
    key: "institution_number",
    label: "Institution number",
    hint: "3 digits",
    sensitive: true,
    digits: 3,
  },
  {
    key: "transit_number",
    label: "Transit (branch) number",
    hint: "5 digits",
    sensitive: true,
    digits: 5,
  },
  {
    key: "account_number",
    label: "Account number",
    hint: "7 to 12 digits — from a cheque or your online banking",
    sensitive: true,
  },
  {
    key: "account_type",
    label: "Account type",
    sensitive: false,
    options: ["Chequing", "Savings"],
  },
  {
    key: "authorization_type",
    label: "This authorization is for",
    sensitive: false,
    options: ["Business use", "Personal use"],
  },
];

/** Server-side validation. The submit endpoint is public — nothing typed
 *  into it is trusted, and a malformed transit number is a payment the
 *  bank bounces weeks later. */
export function validatePadFields(
  input: unknown,
): { ok: true; values: Record<string, string> } | { ok: false; error: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Fill in your banking details." };
  }
  const raw = input as Record<string, unknown>;
  const values: Record<string, string> = {};
  for (const f of PAD_FIELDS) {
    const v = raw[f.key];
    if (typeof v !== "string" || v.trim() === "") {
      return { ok: false, error: `${f.label} is required.` };
    }
    const clean = v.trim().slice(0, 120);
    if (f.digits) {
      const digitsOnly = clean.replace(/\D/g, "");
      if (digitsOnly.length !== f.digits) {
        return {
          ok: false,
          error: `${f.label} must be ${f.digits} digits.`,
        };
      }
      values[f.key] = digitsOnly;
      continue;
    }
    if (f.key === "account_number") {
      const digitsOnly = clean.replace(/\D/g, "");
      if (digitsOnly.length < 7 || digitsOnly.length > 12) {
        return { ok: false, error: "Account number must be 7 to 12 digits." };
      }
      values[f.key] = digitsOnly;
      continue;
    }
    if (f.options && !f.options.includes(clean)) {
      return { ok: false, error: `Choose a valid ${f.label.toLowerCase()}.` };
    }
    values[f.key] = clean;
  }
  return { ok: true, values };
}

/** The Rule H1 clauses. Rendered on the form the client signs AND shown on
 *  screen above the signature, so nobody signs terms they were only shown
 *  inside a PDF they might not have opened. */
export function padTerms(payeeName: string, amountLabel: string): string[] {
  return [
    `I/we authorize ${payeeName} to debit the bank account identified above for ${amountLabel}.`,
    "This is a Pre-Authorized Debit (PAD) agreement under the Rules of Payments Canada.",
    "I/we may revoke this authorization at any time by giving 10 days' written notice to " +
      `${payeeName}. Revoking this authorization does not cancel any contract for services already entered into.`,
    "I/we waive the right to receive pre-notification of the amount of each debit and of any change to that amount, and agree that no advance notice is required before a debit is processed.",
    "I/we have certain recourse rights if any debit does not comply with this agreement. For example, I/we have the right to receive reimbursement for any debit that is not authorized or is not consistent with this PAD agreement. To obtain more information on recourse rights, contact your financial institution or visit payments.ca.",
    "I/we certify that all persons whose signatures are required to authorize transactions on this account have signed below.",
  ];
}

export type PadRenderInput = {
  payeeName: string;
  payeeAddress: string | null;
  clientName: string;
  clientCompany: string | null;
  amountLabel: string;
  /** Null while the form is still blank (the copy that was sent out). */
  values: Record<string, string> | null;
};

/**
 * Draw the PAD form. Called twice per request: once blank, as the document
 * the client is sent, and again with the answers filled in — that filled
 * copy becomes the source the signature and certificate are stamped onto,
 * so what ends up signed is the completed form rather than an empty one.
 */
export async function renderPadFormPdf(
  input: PadRenderInput,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.1, 0.1);
  const grey = rgb(0.4, 0.4, 0.4);
  const margin = 54;
  const width = 612 - margin * 2;
  let y = 792 - margin;

  const line = (
    text: string,
    size = 9.5,
    f = font,
    color = ink,
    gap = 13,
  ) => {
    page.drawText(text, { x: margin, y, size, font: f, color });
    y -= gap;
  };

  /** Naive wrap — Helvetica at 9pt averages ~0.5em per character. */
  const wrap = (text: string, size = 8.5, gap = 11) => {
    const perLine = Math.floor(width / (size * 0.5));
    const words = text.split(/\s+/);
    let cur = "";
    for (const w of words) {
      if ((cur + " " + w).trim().length > perLine) {
        page.drawText(cur, { x: margin, y, size, font, color: grey });
        y -= gap;
        cur = w;
      } else {
        cur = (cur + " " + w).trim();
      }
    }
    if (cur) {
      page.drawText(cur, { x: margin, y, size, font, color: grey });
      y -= gap;
    }
  };

  line("PRE-AUTHORIZED DEBIT (PAD) AGREEMENT", 15, bold, ink, 22);
  line(input.payeeName, 10.5, bold, ink, 13);
  if (input.payeeAddress) line(input.payeeAddress, 9, font, grey, 18);
  else y -= 5;

  line("PAYOR", 8.5, bold, grey, 14);
  line(
    input.clientCompany
      ? `${input.clientName} — ${input.clientCompany}`
      : input.clientName,
    10,
    font,
    ink,
    20,
  );

  line("BANKING DETAILS", 8.5, bold, grey, 15);
  for (const f of PAD_FIELDS) {
    const value = input.values?.[f.key] ?? "";
    page.drawText(`${f.label}:`, {
      x: margin,
      y,
      size: 9,
      font,
      color: grey,
    });
    page.drawText(value || "_________________________", {
      x: margin + 170,
      y,
      size: 9.5,
      font: value ? bold : font,
      color: value ? ink : grey,
    });
    y -= 16;
  }

  y -= 8;
  line("TERMS", 8.5, bold, grey, 14);
  for (const t of padTerms(input.payeeName, input.amountLabel)) {
    wrap(t);
    y -= 3;
  }

  y -= 10;
  page.drawLine({
    start: { x: margin, y },
    end: { x: margin + width, y },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });
  y -= 18;
  line("SIGNATURE", 8.5, bold, grey, 30);
  page.drawLine({
    start: { x: margin, y: y + 8 },
    end: { x: margin + 250, y: y + 8 },
    thickness: 0.5,
    color: grey,
  });
  line("Authorized signature — see certificate of completion", 7.5, font, grey);

  return pdf.save();
}

/** Where the signature belongs on the rendered form, for the existing
 *  anchor-stamping in `buildSignedPdf`. Coordinates track the layout
 *  above; if the layout moves, move this. */
export function padSignatureAnchor(pageCount: number) {
  return {
    role: "signer" as const,
    signerIndex: 0,
    pageIndex: Math.max(0, pageCount - 1),
    x: 54,
    y: 96,
    width: 200,
    maxHeight: 44,
  };
}
