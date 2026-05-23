/**
 * Consent disclosure shown to every signer immediately above the
 * "Sign and submit" button. Centralised so the exact wording is
 * (a) consistent across UI surfaces and (b) snapshotted verbatim into
 * the database at the moment a signer ticks the box, so we can prove
 * later what THIS signer actually agreed to even if we revise the
 * disclosure later.
 *
 * Researched against:
 *   - Alberta Electronic Transactions Act (SA 2001, c E-5.5) s. 7 consent
 *   - Personal Information Protection and Electronic Documents Act (PIPEDA), Part 2
 *   - US ESIGN Act, 15 U.S.C. §7001(c) consumer consent disclosure
 *   - Uniform Electronic Transactions Act (UETA) — intent/consent/association/retention
 */

export const CONSENT_DISCLOSURE_VERSION = "v1-2026-05";

export const CONSENT_DISCLOSURE_TEXT = `I agree to sign this document electronically.

By checking this box and clicking "Sign and submit", I acknowledge that:
- My electronic signature has the same legal effect as a handwritten signature on paper.
- I am signing this document with the intent to be legally bound by it.
- I am able to access, view, download, and print this document and the signed copy I will receive by email.
- I may request a paper copy or decline to sign electronically by replying to the email that invited me to sign. Withdrawing consent does not affect signatures already applied.
- The Workplaces signing service will record my name, email address, IP address, browser, and timestamps as evidence of this signing.`;

/**
 * Short one-line nudge included in the signing-invitation email,
 * before the "Open document to sign" button. Establishes intent +
 * provides the opt-out the ESIGN consumer rule expects.
 */
export const INVITATION_EMAIL_CONSENT_LINE = `By clicking the link below and completing the signing process, you agree to sign this document electronically. If you prefer to sign on paper or have any questions, simply reply to this email and we'll send a printed copy.`;

/**
 * Multi-line legal boilerplate paragraph stamped at the bottom of
 * every Certificate of Completion page. Cites the four governing
 * statutes so a third party reading the signed PDF understands the
 * legal framework that makes it enforceable.
 */
export const CERTIFICATE_BOILERPLATE = `This Certificate of Completion is the official record of the signing of the document identified above. The document was executed electronically using the Workplaces e-signature service. Each signer accepted the terms of electronic signing, was uniquely identified by access to the email address shown, and applied their signature using the technology described above. This record is maintained as evidence of the transaction in accordance with the Electronic Transactions Act (Alberta, SA 2001, c E-5.5), Part 2 of the Personal Information Protection and Electronic Documents Act (Canada), the Electronic Signatures in Global and National Commerce Act (15 U.S.C. §7001 et seq.), and the Uniform Electronic Transactions Act as adopted by US states. The SHA-256 hash above can be used to verify that the signed PDF has not been altered since completion.`;
