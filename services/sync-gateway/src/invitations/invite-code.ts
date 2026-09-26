import { createHmac, randomInt } from "node:crypto";

// The code an inspector types into their phone.
//
// Eight characters from an alphabet with the look-alikes taken out — no 0/O,
// no 1/I/L — so a code read off an SMS in bright sunlight and typed with a
// thumb has one way to be right. That is 31^8, about 8.5 × 10^11 codes; with
// a handful live at any moment, a three-day lifetime and a per-address limit
// on attempts, guessing one is not a practical way in.
//
// Stored as an HMAC under a server secret rather than a bare hash. A bare
// SHA-256 of a space this size falls to a laptop in hours, so a leaked
// database would have been a list of working codes after all.

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const LENGTH = 8;

/** A fresh code, formatted for reading: "K7PM-4XQ2". */
export function newInviteCode(): string {
  let raw = "";
  for (let i = 0; i < LENGTH; i++) raw += ALPHABET[randomInt(ALPHABET.length)];
  return formatInviteCode(raw);
}

/** Group into fours, the way it is shown and the way people read it aloud. */
export function formatInviteCode(normalized: string): string {
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}

/**
 * What the person typed, reduced to the code itself. Case, spaces and dashes
 * are forgiven because they carry no information. Anything that is still not
 * eight characters of the alphabet is not a code.
 */
export function normalizeInviteCode(input: string): string | null {
  const cleaned = input.toUpperCase().replace(/[\s-]/g, "");
  if (cleaned.length !== LENGTH) return null;
  for (const ch of cleaned) if (!ALPHABET.includes(ch)) return null;
  return cleaned;
}

export function hashInviteCode(normalized: string, secret: string): string {
  return createHmac("sha256", secret).update(`invite:${normalized}`).digest("hex");
}

/**
 * Opens the field app on the activation screen with the code filled in, for
 * anyone reading the invitation on the phone they are setting up.
 */
export function activationLink(normalized: string): string {
  return `agroassure://activate?code=${normalized}`;
}
