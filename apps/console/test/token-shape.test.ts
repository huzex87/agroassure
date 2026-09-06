import { describe, it, expect } from "vitest";
import { isWellFormedToken } from "../lib/api";

// A token becomes an HTTP header value, and headers are Latin-1. A single
// character picked up while copying one off a screen — a bullet where a line
// wrapped, a smart quote, a non-breaking space — makes fetch throw
// "Cannot convert argument to a ByteString because the character at index 15
// has a value of 8226", several layers below anything that could explain it.
//
// This is not authentication. The gateway verifies the signature, the issuer
// and the audience, and is the only thing that decides whether a token is real.
// This only decides whether it is worth sending.

const REAL =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" +
  ".eyJzdWIiOiIwMThmMTAwMC0wMDAwLTcwMDAtODAwMC0wMDAwMDAwMDAwMDUifQ" +
  ".sl4ATtjVEOO4S4DK23cOng1C87MLwA3YkBbGHJX6Sgs";

describe("token shape", () => {
  it("accepts three base64url segments", () => {
    expect(isWellFormedToken(REAL)).toBe(true);
  });

  it("rejects the bullet that actually broke a sign-in", () => {
    // U+2022, from a copied string that had wrapped.
    expect(isWellFormedToken("eyJhbGciOi•JIUzI1NiJ9.eyJzdWIiOiJ4In0.abc")).toBe(false);
  });

  it("rejects other characters a copy picks up", () => {
    for (const bad of [
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.ab c", // non-breaking space
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.ab”c", // smart quote
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.ab​c", // zero-width space
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.abc\n",
      "Bearer " + REAL, // the scheme pasted along with the token
    ]) {
      expect(isWellFormedToken(bad)).toBe(false);
    }
  });

  it("rejects anything that is not three segments", () => {
    expect(isWellFormedToken("")).toBe(false);
    expect(isWellFormedToken("abc")).toBe(false);
    expect(isWellFormedToken("abc.def")).toBe(false);
    expect(isWellFormedToken("abc.def.ghi.jkl")).toBe(false);
    expect(isWellFormedToken("..")).toBe(false);
  });

  it("rejects base64 that is not base64url", () => {
    // + and / carry meaning in a URL and never appear in a JWT segment.
    expect(isWellFormedToken("ab+c.def.ghi")).toBe(false);
    expect(isWellFormedToken("ab/c.def.ghi")).toBe(false);
    expect(isWellFormedToken("abc=.def.ghi")).toBe(false);
  });
});
