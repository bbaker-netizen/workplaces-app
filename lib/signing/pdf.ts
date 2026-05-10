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

export type SignerForCertificate = {
  name: string;
  email: string;
  roleLabel: string | null;
  signedAt: Date;
  signerIp: string | null;
  signatureMethod: string | null;
  signatureImageData: string | null; // data:image/png;base64,…
};

export type CertificateInput = {
  envelopeId: string;
  documentName: string;
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

  const page = pdf.addPage();
  const { width, height } = page.getSize();
  const margin = 56;
  let y = height - margin;

  const black = rgb(0.1, 0.1, 0.1);
  const grey = rgb(0.4, 0.4, 0.4);
  const orange = rgb(0.91, 0.467, 0.133); // #E87722

  // Header.
  page.drawText("CERTIFICATE OF COMPLETION", {
    x: margin,
    y,
    size: 11,
    font: helvBold,
    color: grey,
  });
  y -= 26;
  page.drawText("Signed electronically.", {
    x: margin,
    y,
    size: 22,
    font: helvBold,
    color: black,
  });
  y -= 22;
  page.drawText(`Document: ${truncate(cert.documentName, 80)}`, {
    x: margin,
    y,
    size: 10,
    font: helv,
    color: black,
  });
  y -= 14;
  page.drawText(`Envelope ID: ${cert.envelopeId}`, {
    x: margin,
    y,
    size: 9,
    font: helv,
    color: grey,
  });
  y -= 28;

  // Divider.
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 0.5,
    color: grey,
  });
  y -= 24;

  // Signer details.
  for (let i = 0; i < cert.signers.length; i++) {
    const signer = cert.signers[i];
    if (y < 200) {
      // Page break.
      const next = pdf.addPage();
      y = height - margin;
      drawCertHeader(next, helvBold, helv, grey, margin, height);
    }

    page.drawText(
      `Signer ${i + 1}${signer.roleLabel ? ` · ${signer.roleLabel}` : ""}`,
      {
        x: margin,
        y,
        size: 9,
        font: helvBold,
        color: orange,
      },
    );
    y -= 16;
    page.drawText(signer.name, {
      x: margin,
      y,
      size: 14,
      font: helvBold,
      color: black,
    });
    y -= 14;
    page.drawText(signer.email, {
      x: margin,
      y,
      size: 10,
      font: helv,
      color: grey,
    });
    y -= 12;
    page.drawText(
      `Signed ${formatTimestamp(signer.signedAt)}` +
        (signer.signerIp ? ` · IP ${signer.signerIp}` : "") +
        (signer.signatureMethod ? ` · ${signer.signatureMethod}` : ""),
      {
        x: margin,
        y,
        size: 9,
        font: helv,
        color: grey,
      },
    );
    y -= 18;

    // Signature image.
    if (signer.signatureImageData) {
      try {
        const png = await embedSignaturePng(pdf, signer.signatureImageData);
        if (png) {
          const sigW = 180;
          const sigH = (png.height / png.width) * sigW;
          page.drawImage(png.image, {
            x: margin,
            y: y - sigH,
            width: sigW,
            height: sigH,
          });
          y -= sigH + 8;
        }
      } catch {
        // Fall through — image embed errors aren't fatal.
      }
    }

    y -= 18;
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 0.25,
      color: grey,
    });
    y -= 18;
  }

  // Audit timeline.
  if (y < 160) {
    pdf.addPage();
    y = height - margin;
  }
  page.drawText("AUDIT TIMELINE", {
    x: margin,
    y,
    size: 9,
    font: helvBold,
    color: grey,
  });
  y -= 14;
  for (const entry of cert.auditTimeline) {
    if (y < 80) break;
    page.drawText(`${formatTimestamp(entry.at)}  ${entry.event}`, {
      x: margin,
      y,
      size: 8.5,
      font: helv,
      color: black,
    });
    y -= 11;
  }

  // Legal disclaimer pinned at the bottom.
  const disclaimerY = 60;
  page.drawText(
    "Signatures captured electronically. Each signer agreed to do business",
    { x: margin, y: disclaimerY + 16, size: 8, font: helv, color: grey },
  );
  page.drawText(
    "electronically per the US ESIGN Act, Canadian PIPEDA, and Alberta Electronic",
    { x: margin, y: disclaimerY + 6, size: 8, font: helv, color: grey },
  );
  page.drawText(
    "Transactions Act. The IP, timestamp, and method above form the audit trail.",
    { x: margin, y: disclaimerY - 4, size: 8, font: helv, color: grey },
  );
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
  _regular: Awaited<ReturnType<PDFDocument["embedFont"]>>,
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
