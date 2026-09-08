import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/config";

// What a pilot may not start without.
//
// Each of these was a warning at boot, and a warning is what a deployment
// scrolls past. Each describes a promise the platform makes on its own screens:
// that an exhibit cannot be destroyed, that the public surface can read one view
// and nothing else, that a person's role came from the institution's provider.
// A pilot running without them makes those promises falsely, and the inspection
// records it collects are not worth what they claim to be.

const PILOT = {
  APP_ENV: "pilot",
  DATABASE_URL: "postgres://app@db/agroassure",
  PUBLIC_VERIFY_DATABASE_URL: "postgres://verify@db/agroassure",
  OIDC_ISSUER: "https://id.katsina.gov.ng",
  OIDC_AUDIENCE: "agroassure-api",
  EVIDENCE_STORE: "s3",
  EVIDENCE_S3_BUCKET: "agroassure-evidence",
} satisfies NodeJS.ProcessEnv;

describe("a pilot deployment", () => {
  it("starts when every promise it makes is actually backed", () => {
    const config = loadConfig(PILOT);
    expect(config.oidc?.audience).toBe("agroassure-api");
    expect(config.evidenceStore).toBe("s3");
    expect(config.publicVerifyUsesOwnRole).toBe(true);
    expect(config.devSignIn).toBe(false);
  });

  it("refuses a local evidence store, which enforces no such thing", () => {
    expect(() => loadConfig({ ...PILOT, EVIDENCE_STORE: "local" })).toThrow(/EVIDENCE_STORE/);
  });

  it("refuses to let the public surface share the application's connection", () => {
    const { PUBLIC_VERIFY_DATABASE_URL: _omitted, ...env } = PILOT;
    expect(() => loadConfig(env)).toThrow(/PUBLIC_VERIFY_DATABASE_URL/);
  });

  it("refuses a shared secret where an identity provider belongs", () => {
    const { OIDC_ISSUER: _i, OIDC_AUDIENCE: _a, ...env } = PILOT;
    expect(() => loadConfig({ ...env, AUTH_JWT_SECRET: "not-a-provider" })).toThrow(/OIDC_ISSUER/);
  });

  it("names every problem at once, so a deployment is fixed in one pass", () => {
    const { PUBLIC_VERIFY_DATABASE_URL: _p, OIDC_ISSUER: _i, OIDC_AUDIENCE: _a, ...env } = PILOT;
    let message = "";
    try {
      loadConfig({ ...env, AUTH_JWT_SECRET: "s", EVIDENCE_STORE: "local" });
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).toMatch(/OIDC_ISSUER/);
    expect(message).toMatch(/EVIDENCE_STORE/);
    expect(message).toMatch(/PUBLIC_VERIFY_DATABASE_URL/);
  });

  // DEV_SIGNIN alongside a provider is refused everywhere, pilot or not. This
  // covers the other way in: no provider at all, and dev sign-in left on.
  it("refuses development sign-in, which verifies nothing", () => {
    const { OIDC_ISSUER: _i, OIDC_AUDIENCE: _a, ...env } = PILOT;
    expect(() =>
      loadConfig({ ...env, AUTH_JWT_SECRET: "s", DEV_SIGNIN: "true" }),
    ).toThrow(/DEV_SIGNIN/);
  });

  it("leaves a laptop, a test and a demo alone", () => {
    // No APP_ENV, so none of the above applies: this is the shape every
    // development checkout runs in, and it must keep working.
    const config = loadConfig({ DATABASE_URL: "postgres://x", AUTH_JWT_SECRET: "s", DEV_SIGNIN: "true" });
    expect(config.devSignIn).toBe(true);
    expect(config.evidenceStore).toBe("local");
  });
});
