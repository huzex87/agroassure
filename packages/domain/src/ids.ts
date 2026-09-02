import { randomBytes } from "@noble/hashes/utils";

/**
 * Generate a UUIDv7 (time-ordered). Used for event_id and aggregate ids so that
 * ids sort by creation time, which keeps event streams naturally ordered.
 * Portable: relies only on @noble randomBytes, so it runs on device and server.
 */
export function uuidv7(now: number = Date.now()): string {
  const bytes = new Uint8Array(16);

  // 48-bit big-endian millisecond timestamp
  const ts = BigInt(now);
  bytes[0] = Number((ts >> 40n) & 0xffn);
  bytes[1] = Number((ts >> 32n) & 0xffn);
  bytes[2] = Number((ts >> 24n) & 0xffn);
  bytes[3] = Number((ts >> 16n) & 0xffn);
  bytes[4] = Number((ts >> 8n) & 0xffn);
  bytes[5] = Number(ts & 0xffn);

  // 74 bits of randomness fill the rest
  const rnd = randomBytes(10);
  for (let i = 0; i < 10; i++) bytes[6 + i] = rnd[i]!;

  // version 7 in the high nibble of byte 6
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  // variant 10xx in the high bits of byte 8
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  return formatUuid(bytes);
}

function formatUuid(b: Uint8Array): string {
  const hex: string[] = [];
  for (let i = 0; i < 16; i++) hex.push(b[i]!.toString(16).padStart(2, "0"));
  const s = hex.join("");
  return (
    s.slice(0, 8) +
    "-" +
    s.slice(8, 12) +
    "-" +
    s.slice(12, 16) +
    "-" +
    s.slice(16, 20) +
    "-" +
    s.slice(20)
  );
}
