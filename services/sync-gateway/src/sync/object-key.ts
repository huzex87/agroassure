// Evidence is content-addressed: the key is derived from the SHA-256 of the
// bytes, so identical bytes map to one object and a single changed byte is a
// different, clearly distinct object. There is no in-place edit of an exhibit.
//
// The key is computed in two places (the projector records it when the capture
// event arrives, the storage service uses it when the bytes arrive), so it lives
// here on its own and uses "/" explicitly rather than the platform separator:
// an object key is part of the record and must not differ between a Windows
// workstation and a Linux server.

export function evidenceObjectKey(sha256Hex: string): string {
  const h = sha256Hex.toLowerCase();
  return `${h.slice(0, 2)}/${h}`;
}
