import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/config";
import { buildSystemStatus, fromDomain } from "../src/console/system-status";

// The system status page is only useful if each message is true. These pin the
// ones that cost real time: an email sender Resend refuses, a console address
// that was never set, and a second sign-in button that leads nowhere.

const BASE = {
  DATABASE_URL: "postgres://app@db/agroassure",
  AUTH_JWT_SECRET: "development-secret-not-used-anywhere-real",
} satisfies NodeJS.ProcessEnv;

const WORKING = {
  ...BASE,
  CONSOLE_URL: "https://console.example.ng",
  CONSOLE_SESSION_SECRET: "s".repeat(40),
  DEVICE_TOKEN_SECRET: "d".repeat(40),
  EMAIL_PROVIDER: "resend",
  EMAIL_API_KEY: "re_key",
  EMAIL_FROM: "AgroAssure <no-reply@example.ng>",
  FIELD_APP_DOWNLOAD_URL: "https://example.ng/app",
} satisfies NodeJS.ProcessEnv;

const up = { dbUp: true, projectionLag: 0 };
const check = (env: NodeJS.ProcessEnv, id: string, facts = up) =>
  buildSystemStatus(loadConfig(env), facts).checks.find((c) => c.id === id);

describe("fromDomain", () => {
  it("reads the address out of a display-name From header", () => {
    expect(fromDomain("AgroAssure <no-reply@Example.ng>")).toBe("example.ng");
    expect(fromDomain("plain@example.ng")).toBe("example.ng");
    expect(fromDomain(null)).toBeNull();
  });
});

describe("buildSystemStatus", () => {
  it("fails email that is sent from a free-mail address, and says how to fix it", () => {
    const c = check({ ...WORKING, EMAIL_FROM: "agroassure.fiss@gmail.com" }, "email");
    expect(c?.state).toBe("fail");
    expect(c?.detail).toMatch(/gmail\.com/);
    expect(c?.fix).toMatch(/onboarding@resend\.dev/);
  });

  it("warns that Resend's test sender reaches only the account owner", () => {
    const c = check({ ...WORKING, EMAIL_FROM: "onboarding@resend.dev" }, "email");
    expect(c?.state).toBe("warn");
    expect(c?.detail).toMatch(/only/i);
  });

  it("passes email sent from the deployment's own domain", () => {
    expect(check(WORKING, "email")?.state).toBe("ok");
  });

  it("fails sign-in when the console address was never set", () => {
    const { CONSOLE_URL: _a, CONSOLE_SESSION_SECRET: _b, ...rest } = WORKING;
    const c = check(rest, "signin");
    expect(c?.state).toBe("fail");
    expect(c?.fix).toMatch(/CONSOLE_URL/);
  });

  it("warns that a second sign-in provider is a button that leads nowhere", () => {
    const withProvider = {
      ...WORKING,
      OIDC_ISSUER: "https://id.example.ng",
      OIDC_AUDIENCE: "agroassure",
    };
    expect(check(withProvider, "provider")?.state).toBe("warn");
  });

  it("names the real setting for the app download link", () => {
    const { FIELD_APP_DOWNLOAD_URL: _x, ...rest } = WORKING;
    expect(check(rest, "download")?.fix).toMatch(/FIELD_APP_DOWNLOAD_URL/);
    expect(check(WORKING, "download")?.state).toBe("ok");
  });

  it("fails evidence kept on local disk", () => {
    expect(check(WORKING, "evidence")?.state).toBe("fail");
  });

  it("reports a database that is down as broken", () => {
    const s = buildSystemStatus(loadConfig(WORKING), { dbUp: false, projectionLag: null });
    expect(s.overall).toBe("broken");
    expect(s.checks.find((c) => c.id === "database")?.state).toBe("fail");
  });

  it("never carries a secret", () => {
    const json = JSON.stringify(buildSystemStatus(loadConfig(WORKING), up));
    for (const secret of ["re_key", "s".repeat(40), "d".repeat(40), BASE.AUTH_JWT_SECRET]) {
      expect(json).not.toContain(secret);
    }
  });
});
