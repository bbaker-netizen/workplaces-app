/**
 * Adobe Sign wrapper.
 *
 * Phase 2.10. Per CLAUDE.md the prospect → contract flow uses Adobe
 * Sign embedded for signing. This module is the integration scaffold:
 * OAuth-token-based agreement creation, status polling, signed PDF
 * download.
 *
 * Adobe Sign API uses OAuth 2.0 with refresh tokens. For Phase 2.10
 * we ship the request layer + the agreement-creation helper. The
 * full OAuth dance (Bruce authorizes Workplaces → token saved per
 * coach) is Phase 2.10b — for now the access token is read directly
 * from `ADOBE_SIGN_ACCESS_TOKEN` env var (refresh manually).
 *
 * Auth env:
 *   - ADOBE_SIGN_ACCESS_TOKEN — OAuth access token. Refresh manually.
 *   - ADOBE_SIGN_API_BASE — typically https://api.na2.adobesign.com
 *     (varies by region; Workplaces should use the .com NA shard).
 */

const DEFAULT_API_BASE = "https://api.na2.adobesign.com";

function token(): string {
  const t = process.env.ADOBE_SIGN_ACCESS_TOKEN;
  if (!t) {
    throw new Error(
      "ADOBE_SIGN_ACCESS_TOKEN not configured. Set it in .env.local. Refresh tokens via the Adobe Sign Account dashboard.",
    );
  }
  return t;
}

function apiBase(): string {
  return process.env.ADOBE_SIGN_API_BASE ?? DEFAULT_API_BASE;
}

export type AgreementSummary = {
  id: string;
  name: string;
  status: string;
  createdDate: string;
};

export type CreateAgreementInput = {
  /** PDF / DOCX bytes of the contract. */
  fileBytes: ArrayBuffer;
  filename: string;
  contentType: string;
  agreementName: string;
  message: string;
  participantEmails: string[]; // Signers in order.
};

/**
 * Upload a transient document, then create an agreement that points
 * at it. Returns the new agreement id.
 */
export async function createAgreement(
  input: CreateAgreementInput,
): Promise<{ agreementId: string }> {
  // Step 1: upload transient doc.
  const uploadForm = new FormData();
  uploadForm.append(
    "File",
    new Blob([input.fileBytes], { type: input.contentType }),
    input.filename,
  );
  const uploadResp = await fetch(`${apiBase()}/api/rest/v6/transientDocuments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}` },
    body: uploadForm,
  });
  if (!uploadResp.ok) {
    throw new Error(
      `Adobe Sign upload failed (${uploadResp.status}): ${await uploadResp.text()}`,
    );
  }
  const { transientDocumentId } = (await uploadResp.json()) as {
    transientDocumentId: string;
  };

  // Step 2: create the agreement referencing that doc.
  const agreementBody = {
    fileInfos: [{ transientDocumentId }],
    name: input.agreementName,
    participantSetsInfo: input.participantEmails.map((email, i) => ({
      memberInfos: [{ email }],
      order: i + 1,
      role: "SIGNER",
    })),
    signatureType: "ESIGN",
    state: "IN_PROCESS",
    message: input.message,
  };

  const agreementResp = await fetch(`${apiBase()}/api/rest/v6/agreements`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(agreementBody),
  });
  if (!agreementResp.ok) {
    throw new Error(
      `Adobe Sign agreement create failed (${agreementResp.status}): ${await agreementResp.text()}`,
    );
  }
  const { id } = (await agreementResp.json()) as { id: string };
  return { agreementId: id };
}

export async function getAgreementStatus(
  agreementId: string,
): Promise<AgreementSummary> {
  const resp = await fetch(
    `${apiBase()}/api/rest/v6/agreements/${agreementId}`,
    {
      headers: { Authorization: `Bearer ${token()}` },
      cache: "no-store",
    },
  );
  if (!resp.ok) {
    throw new Error(
      `Adobe Sign status fetch failed (${resp.status}): ${await resp.text()}`,
    );
  }
  const data = (await resp.json()) as {
    id: string;
    name: string;
    status: string;
    createdDate: string;
  };
  return {
    id: data.id,
    name: data.name,
    status: data.status,
    createdDate: data.createdDate,
  };
}

export async function downloadSignedAgreement(
  agreementId: string,
): Promise<ArrayBuffer> {
  const resp = await fetch(
    `${apiBase()}/api/rest/v6/agreements/${agreementId}/combinedDocument`,
    {
      headers: { Authorization: `Bearer ${token()}` },
      cache: "no-store",
    },
  );
  if (!resp.ok) {
    throw new Error(
      `Adobe Sign download failed (${resp.status}): ${await resp.text()}`,
    );
  }
  return resp.arrayBuffer();
}
