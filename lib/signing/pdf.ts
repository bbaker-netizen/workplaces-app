/**
 * Signed-PDF generation.
 *
 * Phase 4.5. Takes the original document bytes plus an array of
 * completed signers, produces a new PDF with:
 *   - All original pages preserved.
 *   - A "Certificate of Completion" page appended showing every
 *     signer's name, role, email, signed-at timestamp, IP address,
 *     signature method, and the captured signature image.
 *   - Footer on every page noting "Electronically signed" + envelope id.
 *
 * pdf-lib runs in the Node serverless runtime — no external services.
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { CERTIFICATE_BOILERPLATE } from "./consent-disclosure";

export type SignerForCertificate = {
  name: string;
  email: string;
  roleLabel: string | null;
  signedAt: Date;
  viewedAt: Date | null;
  consentedAt: Date | null;
  signerIp: string | null;
  signerUserAgent: string | null;
  signatureMethod: string | null;
  signatureImageData: string | null; // data:image/png;base64,…
};

export type CertificateInput = {
  envelopeId: string;
  documentName: string;
  /** SHA-256 hash of the source document (the original PDF being
   *  signed). Stamped on the certificate so anyone can verify which
   *  exact file was signed. */
  sourceDocumentHash: string | null;
  envelopeCreatedAt: Date | null;
  envelopeCompletedAt: Date | null;
  senderName: string | null;
  senderEmail: string | null;
  signers: SignerForCertificate[];
  auditTimeline: Array<{ at: Date; event: string }>;
};

/**
 * Build the signed PDF. Returns the new bytes ready to upload.
 */
export async function buildSignedPdf(
  sourceBytes: ArrayBuffer | Uint8Array,
  cert: CertificateInput,
): Promise<Uint8Array> {
  const sourceArray =
    sourceBytes instanceof Uint8Array
      ? sourceBytes
      : new Uint8Array(sourceBytes);

  let pdf: PDFDocument;
  try {
    pdf = await PDFDocument.load(sourceArray, {
      ignoreEncryption: true,
    });
  } catch {
    // Source isn't a valid PDF (e.g. someone uploaded a Word doc).
    // Start fresh — first page will be a notice instead.
    pdf = await PDFDocument.create();
    const notice = pdf.addPage();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    notice.drawText(
      "Original document was not a PDF; certificate of completion follows.",
      { x: 50, y: 750, size: 14, font, color: rgb(0.1, 0.1, 0.1) },
    );
  }

  await appendCertificatePage(pdf, cert);
  await stampPageFooters(pdf, cert.envelopeId);
  return pdf.save();
}

async function appendCertificatePage(
  pdf: PDFDocument,
  cert: CertificateInput,
): Promise<void> {
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Render state — `state.page` and `state.y` advance as we draw; we
  // call `ensureSpace` before each block to flow onto a new page when
  // we'd otherwise run off the bottom margin.
  const margin = 56;
  const footerReserved = 86; // boilerplate paragraph + breathing room
  const state: {
    page: ReturnType<PDFDocument["addPage"]>;
    y: number;
    pageWidth: number;
    pageHeight: number;
  } = (() => {
    const p = pdf.addPage();
    const { width, height } = p.getSize();
    return { page: p, y: height - margin, pageWidth: width, pageHeight: height };
  })();

  // Heritage palette.
  const navy = rgb(0.078, 0.220, 0.357); // #14385B
  const grey = rgb(0.353, 0.392, 0.439); // #5A6470
  const accent = rgb(0.173, 0.424, 0.690); // #2C6CB0

  const ensureSpace = (needed: number) => {
    if (state.y - needed < margin + footerReserved) {
      state.page = pdf.addPage();
      const { width, height } = state.page.getSize();
      state.pageWidth = width;
      state.pageHeight = height;
      state.y = height - margin;
      drawCertHeader(state.page, helvBold, grey, margin, height);
      state.y -= 28;
    }
  };

  const drawLine = (label: string, value: string, opts?: { mono?: boolean }) => {
    ensureSpace(13);
    state.page.drawText(label, {
      x: margin,
      y: state.y,
      size: 8.5,
      font: helvBold,
      color: grey,
    });
    state.page.drawText(value, {
      x: margin + 110,
      y: state.y,
      size: opts?.mono ? 8 : 9.5,
      font: helv,
      color: navy,
    });
    state.y -= 13;
  };

  // Title block.
  state.page.drawText("CERTIFICATE OF COMPLETION", {
    x: margin,
    y: state.y,
    size: 11,
    font: helvBold,
    color: grey,
  });
  state.y -= 26;
  state.page.drawText("Signed electronically.", {
    x: margin,
    y: state.y,
    size: 22,
    font: helvBold,
    color: navy,
  });
  state.y -= 26;

  // Document identification block.
  drawLine("Document:", truncate(cert.documentName, 70));
  drawLine("Envelope ID:", cert.envelopeId, { mono: true });
  if (cert.sourceDocumentHash) {
    drawLine("SHA-256:", cert.sourceDocumentHash, { mono: true });
  }
  if (cert.envelopeCreatedAt) {
    drawLine("Sent:", formatTimestamp(cert.envelopeCreatedAt));
  }
  if (cert.envelopeCompletedAt) {
    drawLine("Completed:", formatTimestamp(cert.envelopeCompletedAt));
  }

  state.y -= 8;
  // Sender block.
  if (cert.senderName || cert.senderEmail) {
    drawLine(
      "Sent by:",
      [cert.senderName, cert.senderEmail].filter(Boolean).join(" · "),
    );
    state.y -= 6;
  }

  // Divider.
  ensureSpace(8);
  state.page.drawLine({
    start: { x: margin, y: state.y },
    end: { x: state.pageWidth - margin, y: state.y },
    thickness: 0.5,
    color: grey,
  });
  state.y -= 18;

  // Signer details.
  for (let i = 0; i < cert.signers.length; i++) {
    const signer = cert.signers[i];
    // Reserve enough for a full signer block (~165pt with image).
    ensureSpace(170);

    state.page.drawText(
      `Signer ${i + 1}${signer.roleLabel ? ` · ${signer.roleLabel}` : ""}`,
      {
        x: margin,
        y: state.y,
        size: 9,
        font: helvBold,
        color: accent,
      },
    );
    state.y -= 16;
    state.page.drawText(signer.name, {
      x: margin,
      y: state.y,
      size: 14,
      font: helvBold,
      color: navy,
    });
    state.y -= 14;
    state.page.drawText(signer.email, {
      x: margin,
      y: state.y,
      size: 10,
      font: helv,
      color: grey,
    });
    state.y -= 14;

    // Timestamp grid (viewed / consented / signed).
    if (signer.viewedAt) {
      state.page.drawText(`Viewed: ${formatTimestamp(signer.viewedAt)}`, {
        x: margin,
        y: state.y,
        size: 8.5,
        font: helv,
        color: grey,
      });
      state.y -= 11;
    }
    if (signer.consentedAt) {
      state.page.drawText(
        `Consented to sign electronically: ${formatTimestamp(signer.consentedAt)}`,
        {
          x: margin,
          y: state.y,
          size: 8.5,
          font: helv,
          color: grey,
        },
      );
      state.y -= 11;
    }
    state.page.drawText(`Signed: ${formatTimestamp(signer.signedAt)}`, {
      x: margin,
      y: state.y,
      size: 8.5,
      font: helv,
      color: grey,
    });
    state.y -= 11;
    const techParts: string[] = [];
    if (signer.signerIp) techParts.push(`IP ${signer.signerIp}`);
    if (signer.signatureMethod) techParts.push(`Method: ${signer.signatureMethod}`);
    if (techParts.length > 0) {
      state.page.drawText(techParts.join(" · "), {
        x: margin,
        y: state.y,
        size: 8.5,
        font: helv,
        color: grey,
      });
      state.y -= 11;
    }
    if (signer.signerUserAgent) {
      state.page.drawText(
        `Browser: ${truncate(signer.signerUserAgent, 100)}`,
        {
          x: margin,
          y: state.y,
          size: 7.5,
          font: helv,
          color: grey,
        },
      );
      state.y -= 11;
    }
    state.y -= 4;

    // Signature image.
    if (signer.signatureImageData) {
      try {
        const png = await embedSignaturePng(pdf, signer.signatureImageData);
        if (png) {
          const sigW = 180;
          const sigH = (png.height / png.width) * sigW;
          ensureSpace(sigH + 12);
          state.page.drawImage(png.image, {
            x: margin,
            y: state.y - sigH,
            width: sigW,
            height: sigH,
          });
          state.y -= sigH + 8;
        }
      } catch {
        // Image embed errors aren't fatal.
      }
    }

    state.y -= 14;
    state.page.drawLine({
      start: { x: margin, y: state.y },
      end: { x: state.pageWidth - margin, y: state.y },
      thickness: 0.25,
      color: grey,
    });
    state.y -= 16;
  }

  // Audit timeline.
  ensureSpace(40);
  state.page.drawText("AUDIT TIMELINE", {
    x: margin,
    y: state.y,
    size: 9,
    font: helvBold,
    color: grey,
  });
  state.y -= 14;
  for (const entry of cert.auditTimeline) {
    ensureSpace(11);
    state.page.drawText(
      `${formatTimestamp(entry.at)}  ${truncate(entry.event, 90)}`,
      {
        x: margin,
        y: state.y,
        size: 8.5,
        font: helv,
        color: navy,
      },
    );
    state.y -= 11;
  }
  state.y -= 8;

  // Legal boilerplate — wrap to fit, render on whichever page we ended
  // up on. ensureSpace handles overflow.
  const wrappedBoilerplate = wrapText(
    CERTIFICATE_BOILERPLATE,
    helv,
    8,
    state.pageWidth - margin * 2,
  );
  ensureSpace(wrappedBoilerplate.length * 10 + 6);
  state.page.drawText("LEGAL FRAMEWORK", {
    x: margin,
    y: state.y,
    size: 8,
    font: helvBold,
    color: grey,
  });
  state.y -= 11;
  for (const line of wrappedBoilerplate) {
    state.page.drawText(line, {
      x: margin,
      y: state.y,
      size: 8,
      font: helv,
      color: grey,
    });
    state.y -= 10;
  }
}

/** Word-wrap a paragraph to fit within `maxWidthPt` at the given font + size. */
function wrapText(
  text: string,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  size: number,
  maxWidthPt: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const tentative = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(tentative, size);
    if (width > maxWidthPt && current) {
      lines.push(current);
      current = word;
    } else {
      current = tentative;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function stampPageFooters(
  pdf: PDFDocument,
  envelopeId: string,
): Promise<void> {
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const grey = rgb(0.55, 0.55, 0.55);
  const pages = pdf.getPages();
  const stamp = `Electronically signed · Envelope ${envelopeId.slice(0, 8)}`;
  for (const page of pages) {
    page.drawText(stamp, {
      x: 36,
      y: 16,
      size: 7,
      font: helv,
      color: grey,
    });
  }
}

function drawCertHeader(
  page: ReturnType<PDFDocument["addPage"]>,
  bold: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  grey: ReturnType<typeof rgb>,
  margin: number,
  height: number,
): void {
  page.drawText("CERTIFICATE OF COMPLETION (continued)", {
    x: margin,
    y: height - margin,
    size: 11,
    font: bold,
    color: grey,
  });
}

async function embedSignaturePng(
  pdf: PDFDocument,
  dataUrl: string,
): Promise<{
  image: Awaited<ReturnType<PDFDocument["embedPng"]>>;
  width: number;
  height: number;
} | null> {
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(dataUrl.trim());
  if (!m) return null;
  const isPng = m[1].toLowerCase() === "png";
  const bytes = Buffer.from(m[2], "base64");
  const image = isPng
    ? await pdf.embedPng(bytes)
    : await pdf.embedJpg(bytes);
  return { image, width: image.width, height: image.height };
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

function formatTimestamp(d: Date): string {
  // Mountain Time, like the rest of the app.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(d);
}
