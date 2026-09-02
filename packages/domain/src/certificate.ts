import type { CertificateStatus, RatingBand } from "./types";

// Certificate validity and issuance eligibility. The platform records and
// renders certificates on behalf of the regulator; it never issues on its own.
// A certificate is only eligible for authorisation when the rating supports it
// and no finding remains open.

export interface CertificateView {
  status: CertificateStatus;
  validTo: string; // ISO date
}

/** Currently valid means not revoked/superseded and not past validTo. */
export function isCurrentlyValid(cert: CertificateView, today: Date = new Date()): boolean {
  if (cert.status !== "valid") return false;
  const validTo = new Date(cert.validTo + "T23:59:59Z");
  return today.getTime() <= validTo.getTime();
}

export interface IssuanceEligibility {
  ratingBand: RatingBand;
  openFindings: number;
}

/**
 * Rating supports issuance and there are no open findings. Critical Issues can
 * never support a certificate. Needs Improvement is a policy decision left to
 * the regulator; the default is to require Satisfactory.
 */
export function ratingSupportsIssuance(band: RatingBand): boolean {
  return band === "satisfactory";
}

export function isEligibleForCertificate(e: IssuanceEligibility): {
  eligible: boolean;
  reason?: string;
} {
  if (e.openFindings > 0) {
    return { eligible: false, reason: "open findings remain" };
  }
  if (!ratingSupportsIssuance(e.ratingBand)) {
    return { eligible: false, reason: `rating ${e.ratingBand} does not support issuance` };
  }
  return { eligible: true };
}

/** Human-typable, unguessable verification serial: AA-<JX>-<4>-<4>. */
export function formatSerial(jurisdictionCode: string, a: string, b: string): string {
  return `AA-${jurisdictionCode.toUpperCase()}-${a}-${b}`;
}

// Crockford base32 without I, L, O, U: no character pair a person can confuse
// when reading a token off a printed certificate and typing it into a phone.
const TOKEN_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * A verification token: 128 bits of randomness in a human-typable form, e.g.
 * AA-3F7K-9QMX-2VTP-R84W-6HND-BJZ5. Unguessable by design, because the QR path
 * must not be enumerable; the printed serial stays short and human-readable and
 * is a public reference, not a secret.
 */
export function mintVerificationToken(random: (n: number) => Uint8Array): string {
  const bytes = random(16); // 128 bits
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += TOKEN_ALPHABET[(value >>> bits) & 31];
    }
  }
  if (bits > 0) out += TOKEN_ALPHABET[(value << (5 - bits)) & 31];
  const groups = out.match(/.{1,4}/g) ?? [];
  return ["AA", ...groups].join("-");
}

/**
 * The human-readable serial printed on the certificate face:
 * AA-KT-0417-2608 (jurisdiction, licence tail, issue month and year).
 */
export function mintSerial(
  jurisdictionCode: string,
  licenceNumber: string,
  issuedOn: Date,
): string {
  const tail = licenceNumber.replace(/[^0-9]/g, "").slice(-4).padStart(4, "0");
  const mm = String(issuedOn.getUTCMonth() + 1).padStart(2, "0");
  const yy = String(issuedOn.getUTCFullYear()).slice(-2);
  return formatSerial(jurisdictionCode, tail, `${yy}${mm}`);
}
