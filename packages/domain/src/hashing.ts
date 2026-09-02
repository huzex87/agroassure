import { sha256 } from "@noble/hashes/sha256";
import { sha512 } from "@noble/hashes/sha512";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";
import * as ed from "@noble/ed25519";
import type { DeviceEvent, EventSignable } from "./events";

// Wire the sync sha512 hook required by @noble/ed25519 v2. Doing it once here
// keeps signing and verification working identically on device and server.
ed.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));

/**
 * Deterministic JSON canonicalization: object keys sorted recursively, no
 * incidental whitespace. Device and server must produce byte-identical output
 * for the same logical value, otherwise a valid signature would fail to verify.
 */
export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "number") {
    if (!Number.isFinite(value as number)) {
      throw new Error("cannot canonicalize non-finite number");
    }
    return JSON.stringify(value);
  }
  if (t === "boolean" || t === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map((v) => canonicalize(v)).join(",") + "]";
  }
  if (t === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    return (
      "{" +
      keys
        .map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k]))
        .join(",") +
      "}"
    );
  }
  throw new Error(`cannot canonicalize value of type ${t}`);
}

/** The exact object hashed and signed. Order is irrelevant because keys sort. */
export function signablePart(e: EventSignable): Record<string, unknown> {
  return {
    eventId: e.eventId,
    aggregateType: e.aggregateType,
    aggregateId: e.aggregateId,
    seq: e.seq,
    eventType: e.eventType,
    payload: e.payload,
    hlc: e.hlc,
    prevHash: e.prevHash,
    deviceId: e.deviceId,
    actorUserId: e.actorUserId,
  };
}

export function sha256Hex(bytes: Uint8Array): string {
  return bytesToHex(sha256(bytes));
}

/** Compute the canonical event hash (hex) over the signable fields. */
export function computeEventHash(e: EventSignable): string {
  const bytes = utf8ToBytes(canonicalize(signablePart(e)));
  return sha256Hex(bytes);
}

/** Sign an event hash with an ed25519 private key (device side, and tests). */
export function signEventHash(eventHashHex: string, privateKey: Uint8Array): string {
  const sig = ed.sign(hexToBytes(eventHashHex), privateKey);
  return bytesToBase64(sig);
}

/** Verify a device signature over an event hash (server side). */
export function verifyEventSignature(
  eventHashHex: string,
  signatureB64: string,
  publicKey: Uint8Array,
): boolean {
  try {
    return ed.verify(base64ToBytes(signatureB64), hexToBytes(eventHashHex), publicKey);
  } catch {
    return false;
  }
}

/** Derive an ed25519 public key from a private key (device enrollment helper). */
export function derivePublicKey(privateKey: Uint8Array): Uint8Array {
  return ed.getPublicKey(privateKey);
}

/** Recompute the hash and confirm it matches the claimed hash on the event. */
export function eventHashMatches(e: DeviceEvent): boolean {
  return computeEventHash(e) === e.eventHash;
}

// ---- pure base64 helpers (no Node/browser globals; portable to React Native) ----

const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_LOOKUP: Int16Array = (() => {
  const t = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64_CHARS.length; i++) t[B64_CHARS.charCodeAt(i)] = i;
  return t;
})();

export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const has1 = i + 1 < bytes.length;
    const has2 = i + 2 < bytes.length;
    const b1 = has1 ? bytes[i + 1]! : 0;
    const b2 = has2 ? bytes[i + 2]! : 0;
    const triple = (b0 << 16) | (b1 << 8) | b2;
    out += B64_CHARS[(triple >> 18) & 0x3f]!;
    out += B64_CHARS[(triple >> 12) & 0x3f]!;
    out += has1 ? B64_CHARS[(triple >> 6) & 0x3f]! : "=";
    out += has2 ? B64_CHARS[triple & 0x3f]! : "=";
  }
  return out;
}

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, "");
  // clean already excludes '=' padding, so its length maps directly to bytes.
  const byteLen = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(Math.max(0, byteLen));
  let outPos = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = B64_LOOKUP[clean.charCodeAt(i)]!;
    const c1 = B64_LOOKUP[clean.charCodeAt(i + 1)]!;
    const c2 = i + 2 < clean.length ? B64_LOOKUP[clean.charCodeAt(i + 2)]! : 0;
    const c3 = i + 3 < clean.length ? B64_LOOKUP[clean.charCodeAt(i + 3)]! : 0;
    const triple = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    if (outPos < byteLen) out[outPos++] = (triple >> 16) & 0xff;
    if (outPos < byteLen) out[outPos++] = (triple >> 8) & 0xff;
    if (outPos < byteLen) out[outPos++] = triple & 0xff;
  }
  return out;
}

export { bytesToHex, hexToBytes, utf8ToBytes };
