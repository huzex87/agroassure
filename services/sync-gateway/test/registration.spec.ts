import { describe, expect, it } from "vitest";
import { loadConfig, type AppConfig, type InviteConfig } from "../src/config/config";
import { loadFirstAdmin, stateCodeFor } from "../src/config/first-admin";
import { hashCode, hashStatusToken, RegistrationService } from "../src/registration/registration.service";
import { RegisterController, Window } from "../src/registration/registration.controller";
import type { PgService } from "../src/db/pg.service";
import type { InviteDelivery } from "../src/invitations/delivery";
import type { InvitationsService } from "../src/invitations/invitations.service";

// Asking to join. The integration suite walks a request through a real
// database; this covers what needs none: when the door is open at all, how the
// secrets are kept, and that the open endpoints refuse bad input and floods
// before they reach the service.

const DEV = {
  DATABASE_URL: "postgres://app@db/agroassure",
  AUTH_JWT_SECRET: "development-secret-not-used-anywhere-real",
} satisfies NodeJS.ProcessEnv;

function invites(email: string, sms: string): InviteConfig {
  return {
    deviceTokenSecret: "a-device-token-secret-of-at-least-32-chars",
    ttlHours: 72,
    appDownloadUrl: null,
    email: { provider: email, apiKey: null, from: null },
    sms: { provider: sms, apiKey: null, senderId: null, account: null, channel: "dnd", defaultCountryCode: "234" },
  } as InviteConfig;
}

function service(config: Partial<AppConfig>, pg: Partial<PgService> = {}) {
  return new RegistrationService(pg as PgService, {} as InviteDelivery, config as AppConfig, {} as InvitationsService);
}

describe("whether registration is open", () => {
  it("is off unless switched on", () => {
    expect(loadConfig(DEV).selfRegistration).toBe(false);
    expect(loadConfig({ ...DEV, SELF_REGISTRATION: "off" }).selfRegistration).toBe(false);
    expect(loadConfig({ ...DEV, SELF_REGISTRATION: "on" }).selfRegistration).toBe(true);
  });

  it("needs both an email and an SMS provider, since both contacts must be proven", () => {
    expect(service({ selfRegistration: true, invites: invites("resend", "termii") }).available()).toBe(true);
    expect(service({ selfRegistration: true, invites: invites("none", "termii") }).available()).toBe(false);
    expect(service({ selfRegistration: true, invites: invites("resend", "none") }).available()).toBe(false);
    expect(service({ selfRegistration: false, invites: invites("resend", "termii") }).available()).toBe(false);
  });

  it("refuses a request plainly when closed, before touching the database", async () => {
    const svc = service({ selfRegistration: true, invites: invites("none", "none") }, {
      query: () => {
        throw new Error("should not be reached");
      },
    });
    await expect(
      svc.start({ fullName: "A B", email: "a@b.ng", phone: "08031234567", jurisdictionId: "x", source: "console" }),
    ).rejects.toMatchObject({ status: 503, response: { reason: "registration_closed" } });
  });

  it("rejects a bad name, email, phone or missing key with a reason", async () => {
    const svc = service({ selfRegistration: true, invites: invites("log", "log") });
    const base = { fullName: "Aisha Bello", email: "aisha@example.org", phone: "08031234567", jurisdictionId: "x" };
    await expect(svc.start({ ...base, fullName: "A", source: "console" })).rejects.toMatchObject({
      response: { reason: "invalid_name" },
    });
    await expect(svc.start({ ...base, email: "not-an-email", source: "console" })).rejects.toMatchObject({
      response: { reason: "invalid_email" },
    });
    await expect(svc.start({ ...base, phone: "12", source: "console" })).rejects.toMatchObject({
      response: { reason: "invalid_phone" },
    });
    await expect(svc.start({ ...base, source: "app" })).rejects.toMatchObject({ response: { reason: "missing_key" } });
    await expect(svc.start({ ...base, source: "app", publicKeyBase64: "AAAA" })).rejects.toMatchObject({
      response: { reason: "invalid_key" },
    });
  });
});

describe("keeping the secrets", () => {
  it("binds a code to its request and channel, so one cannot stand in for another", () => {
    expect(hashCode("r1", "email", "123456")).toBe(hashCode("r1", "email", " 123456 "));
    expect(hashCode("r1", "email", "123456")).not.toBe(hashCode("r1", "sms", "123456"));
    expect(hashCode("r1", "email", "123456")).not.toBe(hashCode("r2", "email", "123456"));
  });

  it("stores the status token only as a hash", () => {
    const h = hashStatusToken("token-value");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("token-value");
  });
});

describe("the open endpoints", () => {
  it("counts in fixed windows", () => {
    const w = new Window(2, 1000);
    expect(w.allow("a", 0)).toBe(true);
    expect(w.allow("a", 10)).toBe(true);
    expect(w.allow("a", 20)).toBe(false);
    expect(w.allow("b", 20)).toBe(true);
    expect(w.allow("a", 1001)).toBe(true);
  });

  const calls: unknown[] = [];
  const fake = {
    start: async (i: unknown) => (calls.push(i), { registrationId: "r", token: "t" }),
    status: async (i: unknown) => (calls.push(i), { status: "pending" }),
  } as unknown as RegistrationService;
  const req = (ip: string) => ({ ip }) as never;

  it("check the shape of a request before the service sees it", () => {
    const c = new RegisterController(fake);
    expect(() => c.start(req("1"), { fullName: "A B", email: "a@b.ng", phone: "0803", jurisdictionId: "nope" })).toThrow(
      /jurisdictionId must be a uuid/,
    );
    expect(() =>
      c.start(req("1"), {
        fullName: "A B",
        email: "a@b.ng",
        phone: "0803",
        jurisdictionId: "018f0000-0000-7000-8000-000000000001",
        source: "admin",
      }),
    ).toThrow(/source must be one of/);
    expect(() => c.status(req("1"), { registrationId: "018f0000-0000-7000-8000-000000000001" })).toThrow(
      /token is required/,
    );
  });

  it("limit how often one phone number can ask", async () => {
    const c = new RegisterController(fake);
    const body = (n: number) => ({
      fullName: "Aisha Bello",
      email: `a${n}@b.ng`,
      phone: "0803 123 4567",
      jurisdictionId: "018f0000-0000-7000-8000-000000000001",
    });
    // Different addresses, same phone: the phone's own budget runs out.
    await c.start(req("10.0.0.1"), body(1));
    await c.start(req("10.0.0.2"), body(2));
    await c.start(req("10.0.0.3"), body(3));
    expect(() => c.start(req("10.0.0.4"), body(4))).toThrow(/Too many requests/);
    // Written another way, it is still the same phone.
    expect(() => c.start(req("10.0.0.5"), { ...body(5), phone: "+234 803 123 4567" })).toThrow(/Too many requests/);
  });

  it("limit how often one email address can ask, whatever the phone", async () => {
    const c = new RegisterController(fake);
    const body = (n: number) => ({
      fullName: "Aisha Bello",
      email: "Same@Example.org",
      phone: `0803 000 000${n}`,
      jurisdictionId: "018f0000-0000-7000-8000-000000000001",
    });
    await c.start(req("10.1.0.1"), body(1));
    await c.start(req("10.1.0.1"), body(2));
    await c.start(req("10.1.0.1"), { ...body(3), email: "same@example.org" });
    expect(() => c.start(req("10.1.0.1"), body(4))).toThrow(/Too many requests/);
  });

  it("let many different people register through the console's one address", async () => {
    const c = new RegisterController(fake);
    for (let n = 0; n < 20; n++) {
      await c.start(req("console"), {
        fullName: "Person Number",
        email: `p${n}@example.org`,
        phone: `0803 111 ${String(n).padStart(4, "0")}`,
        jurisdictionId: "018f0000-0000-7000-8000-000000000001",
      });
    }
  });
});

describe("naming the first administrator", () => {
  it("is off unless an email is given, and refuses one that is not an email", () => {
    expect(loadFirstAdmin({})).toBeNull();
    expect(() => loadFirstAdmin({ FIRST_ADMIN_EMAIL: "not-an-email" })).toThrow(/FIRST_ADMIN_EMAIL/);
  });

  it("fills in the rest sensibly", () => {
    expect(loadFirstAdmin({ FIRST_ADMIN_EMAIL: " Owner@Agency.gov.ng " })).toEqual({
      email: "owner@agency.gov.ng",
      name: "owner",
      state: "Katsina State",
      stateCode: "KATSINA",
    });
    expect(
      loadFirstAdmin({
        FIRST_ADMIN_EMAIL: "a@b.ng",
        FIRST_ADMIN_NAME: "Huzaifa Musa",
        FIRST_ADMIN_STATE: "Kano State",
      }),
    ).toMatchObject({ name: "Huzaifa Musa", state: "Kano State", stateCode: "KANO" });
    expect(stateCodeFor("Federal Capital Territory")).toBe("FEDERALCAPIT");
    expect(loadFirstAdmin({ ...DEV, FIRST_ADMIN_EMAIL: "a@b.ng", FIRST_ADMIN_STATE_CODE: "kt" })?.stateCode).toBe("KT");
  });

  it("reaches the configuration", () => {
    expect(loadConfig({ ...DEV, FIRST_ADMIN_EMAIL: "a@b.ng" }).firstAdmin?.email).toBe("a@b.ng");
    expect(loadConfig(DEV).firstAdmin).toBeNull();
  });
});
