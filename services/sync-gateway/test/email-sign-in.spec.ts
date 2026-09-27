import { describe, expect, it, vi } from "vitest";
import { UnauthorizedException } from "@nestjs/common";
import jwt from "jsonwebtoken";
import { loadConfig, loadEmailSignIn, type AppConfig } from "../src/config/config";
import {
  looksLikeConsoleSession,
  signConsoleSession,
  verifyConsoleSession,
} from "../src/auth/console-session";
import { signInEmail } from "../src/auth/email-sign-in.service";
import { TokenVerifier } from "../src/common/token-verifier";
import { DeviceAuthGuard, getPrincipal } from "../src/common/device-auth.guard";
import type { Principal } from "../src/common/principal";

// Console sign-in by an emailed link. What has to hold: a pilot can run on it
// instead of an identity provider without leaving the development shared
// secret behind as a second way in; a console session names a person and the
// register decides their roles on every request; and the link email says
// plainly what it is for.

const SECRET = "a-console-session-secret-of-at-least-32-chars";
const USER = "018f1000-0000-7000-8000-000000000001";
const KATSINA = "018f0000-0000-7000-8000-000000000001";

const PILOT_WITH_EMAIL = {
  APP_ENV: "pilot",
  DATABASE_URL: "postgres://app@db/agroassure",
  PUBLIC_VERIFY_DATABASE_URL: "postgres://verify@db/agroassure",
  EVIDENCE_STORE: "s3",
  EVIDENCE_S3_BUCKET: "agroassure-evidence",
  CONSOLE_URL: "https://console.agroassure.ng/",
  CONSOLE_SESSION_SECRET: SECRET,
  EMAIL_PROVIDER: "resend",
  EMAIL_API_KEY: "re_x",
  EMAIL_FROM: "AgroAssure <no-reply@agroassure.ng>",
} satisfies NodeJS.ProcessEnv;

describe("configuring email sign-in", () => {
  it("is off unless the console's address is given", () => {
    expect(loadEmailSignIn({}, "dev")).toBeNull();
  });

  it("uses the development secret in development and trims the trailing slash", () => {
    expect(loadEmailSignIn({ CONSOLE_URL: "http://localhost:3000/" }, "dev-secret")).toEqual({
      sessionSecret: "dev-secret",
      consoleUrl: "http://localhost:3000",
      linkTtlMinutes: 15,
    });
  });

  it("refuses a short secret, a missing one and an address that is not a URL", () => {
    expect(() => loadEmailSignIn({ CONSOLE_URL: "https://c", CONSOLE_SESSION_SECRET: "short" }, null)).toThrow(/32/);
    expect(() => loadEmailSignIn({ CONSOLE_URL: "https://c" }, null)).toThrow(/CONSOLE_SESSION_SECRET/);
    expect(() => loadEmailSignIn({ CONSOLE_URL: "console.example" }, "s")).toThrow(/https/);
  });
});

describe("a pilot signing staff in by email", () => {
  it("starts without an identity provider", () => {
    const config = loadConfig(PILOT_WITH_EMAIL);
    expect(config.oidc).toBeNull();
    expect(config.emailSignIn).toMatchObject({ consoleUrl: "https://console.agroassure.ng" });
  });

  it("refuses to keep the development shared secret as a second way in", () => {
    expect(() => loadConfig({ ...PILOT_WITH_EMAIL, AUTH_JWT_SECRET: "anything" })).toThrow(
      /AUTH_JWT_SECRET is set without an identity provider/,
    );
  });

  it("refuses when nobody would ever receive a link", () => {
    const { EMAIL_PROVIDER: _p, EMAIL_API_KEY: _k, EMAIL_FROM: _f, ...env } = PILOT_WITH_EMAIL;
    expect(() => loadConfig(env)).toThrow(/EMAIL_PROVIDER is not a real provider/);
  });

  it("will not fall back to a development secret in a pilot", () => {
    const { CONSOLE_SESSION_SECRET: _s, ...env } = PILOT_WITH_EMAIL;
    expect(() => loadConfig(env)).toThrow(/CONSOLE_SESSION_SECRET/);
  });

  it("refuses a pilot with no way for staff to sign in at all", () => {
    const { CONSOLE_URL: _u, CONSOLE_SESSION_SECRET: _s, ...env } = PILOT_WITH_EMAIL;
    expect(() => loadConfig(env)).toThrow(/no way to sign in|no way for staff to sign in/);
  });
});

describe("a console session", () => {
  it("round-trips and is recognisable without being trusted", () => {
    const token = signConsoleSession(USER, SECRET);
    expect(looksLikeConsoleSession(token)).toBe(true);
    expect(verifyConsoleSession(token, SECRET)).toEqual({ sub: USER });
    expect(() => verifyConsoleSession(token, `${SECRET}-other`)).toThrow();
  });

  const config = (overrides: Partial<AppConfig> = {}) =>
    ({
      oidc: null,
      authJwtSecret: "",
      emailSignIn: { sessionSecret: SECRET, consoleUrl: "https://c", linkTtlMinutes: 15 },
      invites: { deviceTokenSecret: null },
      ...overrides,
    }) as unknown as AppConfig;

  it("carries no roles through the verifier", async () => {
    const principal = await new TokenVerifier(config()).verify(signConsoleSession(USER, SECRET));
    expect(principal).toMatchObject({ userId: USER, roles: [], via: "console" });
  });

  it("is the only thing accepted when there is no provider and no shared secret", async () => {
    // A token minted with some other secret, claiming every role, gets nowhere.
    const forged = jwt.sign({ sub: USER, roles: ["national_admin"] }, "guessed");
    await expect(new TokenVerifier(config()).verify(forged)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe("the guard, for a console session", () => {
  const metrics = { increment: vi.fn() };
  const context = (req: unknown) => ({ switchToHttp: () => ({ getRequest: () => req }) }) as never;
  const session: Principal = { userId: USER, deviceId: null, jurisdictionId: null, roles: [], via: "console" };

  function guard(person: { id: string; jurisdictionId: string | null; roles: string[] } | null) {
    return new DeviceAuthGuard(
      { verify: vi.fn().mockResolvedValue(session) } as never,
      { resolveConsoleUser: vi.fn().mockResolvedValue(person) } as never,
      metrics as never,
    );
  }

  it("takes roles and state from the register, dropping any it does not know", async () => {
    const req = { headers: { authorization: "Bearer t" } };
    await guard({ id: USER, jurisdictionId: KATSINA, roles: ["desk_supervisor", "superuser"] }).canActivate(context(req));
    expect(getPrincipal(req as never)).toMatchObject({ roles: ["desk_supervisor"], jurisdictionId: KATSINA });
  });

  it("leaves a national role unscoped", async () => {
    const req = { headers: { authorization: "Bearer t" } };
    await guard({ id: USER, jurisdictionId: KATSINA, roles: ["national_admin"] }).canActivate(context(req));
    expect(getPrincipal(req as never).jurisdictionId).toBeNull();
  });

  it("refuses someone suspended since they signed in", async () => {
    await expect(guard(null).canActivate(context({ headers: { authorization: "Bearer t" } }))).rejects.toMatchObject({
      response: { reason: "account_inactive" },
    });
  });
});

describe("the sign-in email", () => {
  it("greets the person, links once, and says what to do if it was not them", () => {
    const mail = signInEmail("Hauwa Lawal", "https://c/signin/verify?token=abc", 15);
    expect(mail.subject).toBe("Your AgroAssure sign-in link");
    expect(mail.text).toContain("Hello Hauwa");
    expect(mail.text).toContain("https://c/signin/verify?token=abc");
    expect(mail.text).toContain("expires in 15 minutes");
    expect(mail.html).toContain('href="https://c/signin/verify?token=abc"');
  });

  it("escapes a name in the HTML", () => {
    expect(signInEmail("<b>x</b>", "https://c", 15).html).not.toContain("<b>x</b>");
  });
});
