import { describe, it, expect } from "vitest";
import {
  canonicalize,
  computeEventHash,
  signEventHash,
  verifyEventSignature,
  derivePublicKey,
  eventHashMatches,
  type EventSignable,
  type DeviceEvent,
} from "../src";

describe("canonicalization and hashing", () => {
  it("is stable regardless of key order", () => {
    const a = canonicalize({ b: 1, a: 2, c: { y: 1, x: 2 } });
    const b = canonicalize({ c: { x: 2, y: 1 }, a: 2, b: 1 });
    expect(a).toBe(b);
  });

  it("drops undefined fields", () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe(canonicalize({ a: 1 }));
  });

  it("produces a matching hash on device and server for the same event", () => {
    const e: EventSignable = {
      eventId: "018f0000-0000-7000-8000-000000000001",
      aggregateType: "inspection",
      aggregateId: "018f0000-0000-7000-8000-0000000000aa",
      seq: 12,
      eventType: "ResponseRecorded",
      payload: { checkpointRef: "2.3", response: "no", remark: "damp wall" },
      hlc: "000000000001000:00001:device-a",
      prevHash: null,
      deviceId: "018f0000-0000-7000-8000-0000000000dd",
      actorUserId: "018f0000-0000-7000-8000-0000000000ee",
    };
    expect(computeEventHash(e)).toBe(computeEventHash({ ...e }));
  });
});

describe("ed25519 signing and verification", () => {
  it("signs an event hash and verifies with the derived public key", () => {
    // deterministic 32-byte private key for the test
    const priv = new Uint8Array(32);
    for (let i = 0; i < 32; i++) priv[i] = (i * 7 + 3) & 0xff;
    const pub = derivePublicKey(priv);

    const signable: EventSignable = {
      eventId: "018f0000-0000-7000-8000-000000000002",
      aggregateType: "inspection",
      aggregateId: "018f0000-0000-7000-8000-0000000000ab",
      seq: 1,
      eventType: "InspectionStarted",
      payload: { reference: "INS-KT-2026-01184" },
      hlc: "000000000000005:00000:device-a",
      prevHash: null,
      deviceId: "018f0000-0000-7000-8000-0000000000dd",
      actorUserId: null,
    };
    const eventHash = computeEventHash(signable);
    const sig = signEventHash(eventHash, priv);

    const event: DeviceEvent = { ...signable, eventHash, deviceSig: sig };
    expect(eventHashMatches(event)).toBe(true);
    expect(verifyEventSignature(eventHash, sig, pub)).toBe(true);

    // a tampered payload changes the hash and breaks verification
    const tampered = computeEventHash({ ...signable, payload: { reference: "changed" } });
    expect(verifyEventSignature(tampered, sig, pub)).toBe(false);
  });
});
