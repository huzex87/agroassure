import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import {
  authorizeUrl,
  challengeFor,
  newState,
  newVerifier,
  oidcSettings,
  type OidcSettings,
} from "../lib/oidc";

// The console is not a trust boundary — the gateway verifies every token
// independently — so what is checked here is the parts that would fail quietly:
// a PKCE challenge that does not match its verifier, and a configuration that is
// half-set and therefore neither one mode nor the other.

const SETTINGS: OidcSettings = {
  issuer: "https://id.katsina.gov.ng",
  clientId: "agroassure-console",
  clientSecret: "not-a-real-secret",
  redirectUri: "https://console.example/signin/callback",
  scope: "openid profile email",
};

const ENV_KEYS = [
  "OIDC_ISSUER",
  "OIDC_CLIENT_ID",
  "OIDC_CLIENT_SECRET",
  "OIDC_REDIRECT_URI",
  "OIDC_AUDIENCE",
  "OIDC_SCOPE",
];

describe("PKCE", () => {
  it("derives a challenge that is the S256 of its verifier", () => {
    const verifier = newVerifier();
    // If these disagree the provider rejects the exchange and nobody can sign
    // in — visible, but only once it is in front of a real provider.
    expect(challengeFor(verifier)).toBe(
      createHash("sha256").update(verifier).digest("base64url"),
    );
  });

  it("produces base64url with no padding or characters needing escaping", () => {
    for (const value of [newVerifier(), newState(), challengeFor(newVerifier())]) {
      expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("gives a fresh verifier and state every time", () => {
    const verifiers = new Set(Array.from({ length: 50 }, newVerifier));
    const states = new Set(Array.from({ length: 50 }, newState));
    expect(verifiers.size).toBe(50);
    expect(states.size).toBe(50);
  });

  it("makes a verifier long enough to be worth hashing", () => {
    // RFC 7636 wants 43-128 characters; 32 random bytes lands at 43.
    expect(newVerifier().length).toBeGreaterThanOrEqual(43);
  });
});

describe("the authorize URL", () => {
  it("asks for a code with S256, never a plain challenge", () => {
    const url = new URL(authorizeUrl(SETTINGS, "state-1", "challenge-1"));
    expect(url.origin + url.pathname).toBe("https://id.katsina.gov.ng/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe("challenge-1");
    expect(url.searchParams.get("state")).toBe("state-1");
  });

  it("never puts the client secret in a URL the browser will follow", () => {
    const url = authorizeUrl(SETTINGS, "state-1", "challenge-1");
    expect(url).not.toContain(SETTINGS.clientSecret);
  });
});

describe("configuration", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("is null when nothing is set, which is what keeps the development page", () => {
    expect(oidcSettings()).toBeNull();
  });

  it("is null when the configuration is only half there", () => {
    // Half-configured must mean "not configured". Falling through to a partly
    // built redirect would strand everyone at a broken sign-in with no way back
    // to the token box.
    process.env.OIDC_ISSUER = "https://id.example";
    process.env.OIDC_CLIENT_ID = "console";
    expect(oidcSettings()).toBeNull();
  });

  it("trims the trailing slash so the issuer matches what the gateway checks", () => {
    process.env.OIDC_ISSUER = "https://id.example/";
    process.env.OIDC_CLIENT_ID = "console";
    process.env.OIDC_CLIENT_SECRET = "secret";
    process.env.OIDC_REDIRECT_URI = "https://console.example/signin/callback";
    expect(oidcSettings()?.issuer).toBe("https://id.example");
  });
});
