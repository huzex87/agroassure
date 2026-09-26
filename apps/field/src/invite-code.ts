// The invite code as the phone handles it. The gateway is the one that decides
// whether a code is real; this only tidies what a thumb typed.

export const CODE_LENGTH = 8;
const ALPHABET = /[ABCDEFGHJKMNPQRSTUVWXYZ23456789]/;

/** What the person typed, as the eight characters that matter. */
export function cleanCode(input: string): string {
  return input
    .toUpperCase()
    .split("")
    .filter((c) => ALPHABET.test(c))
    .join("")
    .slice(0, CODE_LENGTH);
}

/** Shown the way it was printed in the message: two groups of four. */
export function displayCode(clean: string): string {
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}
