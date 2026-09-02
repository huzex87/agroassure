import { describe, it, expect } from "vitest";
import {
  formatSerial,
  isCurrentlyValid,
  isEligibleForCertificate,
  mintSerial,
  mintVerificationToken,
  ratingSupportsIssuance,
} from "../src/certificate";

describe("certificate validity", () => {
  it("is valid up to and including the last day", () => {
    const cert = { status: "valid" as const, validTo: "2027-08-17" };
    expect(isCurrentlyValid(cert, new Date("2027-08-17T18:00:00Z"))).toBe(true);
    expect(isCurrentlyValid(cert, new Date("2027-08-18T00:00:01Z"))).toBe(false);
  });

  it("is not valid once revoked, whatever the dates say", () => {
    // Revocation never deletes the record; it stops the public page confirming it.
    expect(
      isCurrentlyValid({ status: "revoked", validTo: "2099-01-01" }, new Date("2026-08-18")),
    ).toBe(false);
    expect(
      isCurrentlyValid({ status: "superseded", validTo: "2099-01-01" }, new Date("2026-08-18")),
    ).toBe(false);
  });
});

describe("issuance eligibility", () => {
  it("requires a Satisfactory rating", () => {
    expect(ratingSupportsIssuance("satisfactory")).toBe(true);
    expect(ratingSupportsIssuance("needs_improvement")).toBe(false);
    expect(ratingSupportsIssuance("critical_issues")).toBe(false);
  });

  it("refuses while any finding is open, even on a Satisfactory rating", () => {
    // An inspection can be Satisfactory overall and still raise findings; the
    // certificate waits for them to be verified closed.
    expect(
      isEligibleForCertificate({ ratingBand: "satisfactory", openFindings: 1 }),
    ).toMatchObject({ eligible: false, reason: "open findings remain" });
  });

  it("allows issuance when the rating supports it and nothing is open", () => {
    expect(isEligibleForCertificate({ ratingBand: "satisfactory", openFindings: 0 })).toEqual({
      eligible: true,
    });
  });
});

describe("serial and verification token", () => {
  it("prints a short, human-readable serial: AA-<jurisdiction>-<licence tail>-<yymm>", () => {
    expect(mintSerial("KT", "FISS/KT/AD/2026/0417", new Date("2026-08-18T00:00:00Z"))).toBe(
      "AA-KT-0417-2608",
    );
    expect(formatSerial("kt", "0417", "2608")).toBe("AA-KT-0417-2608");
  });

  it("pads a short licence number rather than producing a ragged serial", () => {
    expect(mintSerial("KT", "AD/17", new Date("2026-01-05T00:00:00Z"))).toBe("AA-KT-0017-2601");
  });

  it("mints an unguessable token, distinct from the printed serial", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const token = mintVerificationToken((n) => {
        const b = new Uint8Array(n);
        for (let j = 0; j < n; j++) b[j] = Math.floor(Math.random() * 256);
        return b;
      });
      expect(token).toMatch(/^AA(-[0-9A-HJKMNP-TV-Z]{1,4})+$/);
      seen.add(token);
    }
    // 128 bits: 200 draws must not collide.
    expect(seen.size).toBe(200);
  });

  it("encodes the full 128 bits it is given", () => {
    const allZero = mintVerificationToken((n) => new Uint8Array(n));
    const allOnes = mintVerificationToken((n) => new Uint8Array(n).fill(0xff));
    expect(allZero).not.toBe(allOnes);
    // 128 bits in base32 is 26 characters, grouped in fours.
    expect(allZero.replace(/-/g, "").slice(2)).toHaveLength(26);
  });

  it("uses no character a reader could confuse when typing a token off paper", () => {
    const token = mintVerificationToken((n) => new Uint8Array(n).fill(0x5a));
    expect(token).not.toMatch(/[ILOU]/);
  });
});
