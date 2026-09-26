import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BadRequestException,
  ConflictException,
  GoneException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import jwt from "jsonwebtoken";
import { bytesToBase64, derivePublicKey } from "@agroassure/domain";
import {
  activationLink,
  formatInviteCode,
  hashInviteCode,
  newInviteCode,
  normalizeInviteCode,
} from "../src/invitations/invite-code";
import {
  emailHtml,
  emailText,
  InviteDelivery,
  normalizePhone,
  smsText,
  type InviteMessage,
} from "../src/invitations/delivery";
import {
  looksLikeDeviceSession,
  signDeviceSession,
  verifyDeviceSession,
} from "../src/invitations/device-session";
import { InvitationsService } from "../src/invitations/invitations.service";
import { loadInvites, type AppConfig, type InviteConfig } from "../src/config/config";
import { TokenVerifier } from "../src/common/token-verifier";
import { DeviceAuthGuard, getPrincipal } from "../src/common/device-auth.guard";
import type { Principal } from "../src/common/principal";

// Invitations replace "wait for an administrator to approve this phone" with
// "the administrator decided when they sent the code". Everything that made
// the old gate worth having has to survive the move: only an administrator can
// bring a phone into service, a code works once, a phone signed out stays
// signed out, and nothing a phone holds is worth anything once it has been.

const SECRET = "a-device-session-secret-of-at-least-32-chars";
const USER = "018f1000-0000-7000-8000-000000000001";
const OTHER_USER = "018f1000-0000-7000-8000-000000000002";
const DEVICE = "018f0000-0000-7000-8000-0000000000dd";
const KATSINA = "018f0000-0000-7000-8000-000000000001";

const KEY = bytesToBase64(
  derivePublicKey(
    (() => {
      const k = new Uint8Array(32);
      for (let i = 0; i < 32; i++) k[i] = (i * 7 + 3) & 0xff;
      return k;
    })(),
  ),
);

function invites(overrides: Partial<InviteConfig> = {}): InviteConfig {
  return {
    deviceTokenSecret: SECRET,
    ttlHours: 72,
    appDownloadUrl: "https://example.org/app",
    email: { provider: "log", apiKey: null, from: null },
    sms: {
      provider: "log",
      apiKey: null,
      senderId: null,
      account: null,
      channel: "dnd",
      defaultCountryCode: "234",
    },
    ...overrides,
  };
}

function appConfig(overrides: Partial<InviteConfig> = {}): AppConfig {
  return { invites: invites(overrides), oidc: null, authJwtSecret: "x" } as unknown as AppConfig;
}

const message: InviteMessage = {
  fullName: "Aisha Bello",
  code: "K7PM-4XQ2",
  link: activationLink("K7PM4XQ2"),
  expiresAt: new Date("2026-09-29T12:00:00Z"),
  invitedBy: "Musa Danjuma",
  appDownloadUrl: "https://example.org/app",
};

describe("the invite code", () => {
  it("is eight characters with no look-alikes, shown in two groups", () => {
    for (let i = 0; i < 200; i++) {
      const code = newInviteCode();
      expect(code).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    }
  });

  it("forgives case, spaces and dashes, and nothing else", () => {
    expect(normalizeInviteCode("k7pm-4xq2")).toBe("K7PM4XQ2");
    expect(normalizeInviteCode(" K7PM 4XQ2 ")).toBe("K7PM4XQ2");
    expect(formatInviteCode("K7PM4XQ2")).toBe("K7PM-4XQ2");
    // Too short, too long, or a character the alphabet never uses.
    expect(normalizeInviteCode("K7PM4XQ")).toBeNull();
    expect(normalizeInviteCode("K7PM4XQ22")).toBeNull();
    expect(normalizeInviteCode("K7PM4XQ0")).toBeNull();
  });

  it("is stored keyed to the server secret, so a leaked table is not a list of codes", () => {
    const a = hashInviteCode("K7PM4XQ2", SECRET);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(hashInviteCode("K7PM4XQ2", SECRET)).toBe(a);
    expect(hashInviteCode("K7PM4XQ2", `${SECRET}-other`)).not.toBe(a);
  });

  it("opens the app on the phone it is read on", () => {
    expect(activationLink("K7PM4XQ2")).toBe("agroassure://activate?code=K7PM4XQ2");
  });
});

describe("phone numbers as people write them", () => {
  it("turns local Nigerian numbers into international ones", () => {
    expect(normalizePhone("0803 123 4567")).toBe("+2348031234567");
    expect(normalizePhone("08031234567")).toBe("+2348031234567");
    expect(normalizePhone("2348031234567")).toBe("+2348031234567");
    expect(normalizePhone("+234 803-123-4567")).toBe("+2348031234567");
    expect(normalizePhone("8031234567")).toBe("+2348031234567");
  });

  it("leaves a number from elsewhere alone", () => {
    expect(normalizePhone("+44 7700 900123")).toBe("+447700900123");
    expect(normalizePhone("0044 7700 900123")).toBe("+447700900123");
  });

  it("refuses what cannot be a number", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("call me")).toBeNull();
    expect(normalizePhone("+12")).toBeNull();
  });
});

describe("the messages", () => {
  it("puts the code, what to do, and the deadline in the text", () => {
    const text = smsText(message);
    expect(text).toContain("K7PM-4XQ2");
    expect(text).toContain("Hi Aisha");
    expect(text).toContain("https://example.org/app");
    expect(text).toMatch(/Expires 29 Sept?\.? 2026/);
  });

  it("fits one SMS when there is no download link to quote", () => {
    expect(smsText({ ...message, appDownloadUrl: null }).length).toBeLessThanOrEqual(160);
  });

  it("says who sent the email and how to use the code", () => {
    const text = emailText(message);
    expect(text).toContain("Musa Danjuma has invited you");
    expect(text).toContain("Your invite code: K7PM-4XQ2");
    expect(text).toContain(message.link);
  });

  it("escapes names in the HTML email", () => {
    const html = emailHtml({ ...message, fullName: "<script>x</script>", invitedBy: "A & B" });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("A &amp; B");
    expect(html).toContain("K7PM-4XQ2");
  });
});

describe("delivery", () => {
  afterEach(() => vi.unstubAllGlobals());

  function delivery(overrides: Partial<InviteConfig>) {
    return new InviteDelivery(appConfig(overrides));
  }

  it("skips a channel with no address rather than failing it", async () => {
    const d = delivery({});
    expect((await d.sendEmail(null, message)).status).toBe("skipped");
    expect((await d.sendSms(null, message)).status).toBe("skipped");
  });

  it("says plainly when a channel is not set up", async () => {
    const d = delivery({
      email: { provider: "none", apiKey: null, from: null },
      sms: { ...invites().sms, provider: "none" },
    });
    const email = await d.sendEmail("aisha@example.org", message);
    expect(email).toMatchObject({ status: "skipped", detail: "email sending is not set up" });
    const sms = await d.sendSms("0803 123 4567", message);
    expect(sms).toMatchObject({ status: "skipped", to: "+2348031234567" });
  });

  it("sends a Termii SMS on the DND route to the international number", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const d = delivery({
      sms: { ...invites().sms, provider: "termii", apiKey: "k", senderId: "AgroAssure" },
    });

    const outcome = await d.sendSms("0803 123 4567", message);
    expect(outcome).toEqual({ to: "+2348031234567", status: "sent", detail: null });

    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://api.ng.termii.com/api/sms/send");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ to: "2348031234567", from: "AgroAssure", channel: "dnd", api_key: "k" });
    expect(body.sms).toContain("K7PM-4XQ2");
  });

  it("sends an email through Resend with both HTML and text", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const d = delivery({ email: { provider: "resend", apiKey: "re_x", from: "AgroAssure <no-reply@x.ng>" } });

    expect((await d.sendEmail("aisha@example.org", message)).status).toBe("sent");
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.authorization).toBe("Bearer re_x");
    const body = JSON.parse(init.body);
    expect(body.to).toEqual(["aisha@example.org"]);
    expect(body.html).toContain("K7PM-4XQ2");
    expect(body.text).toContain("K7PM-4XQ2");
  });

  it("records a provider's refusal instead of throwing it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("insufficient balance", { status: 402 })));
    const d = delivery({
      sms: { ...invites().sms, provider: "termii", apiKey: "k", senderId: "AgroAssure" },
    });
    const outcome = await d.sendSms("08031234567", message);
    expect(outcome.status).toBe("failed");
    expect(outcome.detail).toContain("402");
  });
});

describe("configuration", () => {
  it("defaults to logging in development and to sending nothing in a pilot", () => {
    expect(loadInvites({}, "dev-secret").email.provider).toBe("log");
    // A code printed into a pilot's logs is a code handed to whoever reads them.
    const pilot = loadInvites({ APP_ENV: "pilot" }, null);
    expect(pilot.email.provider).toBe("none");
    expect(pilot.sms.provider).toBe("none");
  });

  it("refuses a provider named without its credentials", () => {
    expect(() => loadInvites({ SMS_PROVIDER: "termii" }, null)).toThrow(/SMS_API_KEY/);
    expect(() => loadInvites({ EMAIL_PROVIDER: "resend", EMAIL_API_KEY: "k" }, null)).toThrow(
      /EMAIL_FROM/,
    );
    expect(() =>
      loadInvites({ SMS_PROVIDER: "africastalking", SMS_API_KEY: "k", SMS_SENDER_ID: "A" }, null),
    ).toThrow(/SMS_ACCOUNT/);
  });

  it("refuses a short device secret, and otherwise prefers it to the development one", () => {
    expect(() => loadInvites({ DEVICE_TOKEN_SECRET: "short" }, null)).toThrow(/32 characters/);
    expect(loadInvites({ DEVICE_TOKEN_SECRET: SECRET }, "dev").deviceTokenSecret).toBe(SECRET);
    expect(loadInvites({}, "dev").deviceTokenSecret).toBe("dev");
    expect(loadInvites({}, null).deviceTokenSecret).toBeNull();
  });
});

describe("a phone's session", () => {
  it("round-trips, and is recognisable without being trusted", () => {
    const token = signDeviceSession(USER, DEVICE, SECRET);
    expect(looksLikeDeviceSession(token)).toBe(true);
    expect(verifyDeviceSession(token, SECRET)).toEqual({ sub: USER, device_id: DEVICE, typ: "device" });
  });

  it("is refused under any other secret", () => {
    const token = signDeviceSession(USER, DEVICE, "someone-elses-secret-also-32-chars-long");
    expect(() => verifyDeviceSession(token, SECRET)).toThrow();
  });

  it("is not mistaken for an ordinary token", () => {
    expect(looksLikeDeviceSession(jwt.sign({ sub: USER, roles: ["inspector"] }, SECRET))).toBe(false);
  });

  it("carries no roles through the verifier: those are the database's to give", async () => {
    const verifier = new TokenVerifier(appConfig());
    const principal = await verifier.verify(signDeviceSession(USER, DEVICE, SECRET));
    expect(principal).toMatchObject({ userId: USER, deviceId: DEVICE, roles: [], via: "device" });
  });

  it("is refused when this server has no device secret", async () => {
    const verifier = new TokenVerifier(appConfig({ deviceTokenSecret: null }));
    await expect(verifier.verify(signDeviceSession(USER, DEVICE, SECRET))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe("the guard, for a phone", () => {
  const metrics = { increment: vi.fn() };
  const context = (req: unknown) =>
    ({ switchToHttp: () => ({ getRequest: () => req }) }) as never;
  const phone: Principal = { userId: USER, deviceId: DEVICE, jurisdictionId: null, roles: [], via: "device" };

  function guard(resolved: { id: string; jurisdictionId: string | null } | null) {
    const resolvePhone = vi.fn().mockResolvedValue(resolved);
    return {
      resolvePhone,
      guard: new DeviceAuthGuard(
        { verify: vi.fn().mockResolvedValue(phone) } as never,
        { resolvePhone, resolve: vi.fn() } as never,
        metrics as never,
      ),
    };
  }

  it("makes an active phone an inspector in the register's jurisdiction", async () => {
    const req = { headers: { authorization: "Bearer t" } };
    const { guard: g, resolvePhone } = guard({ id: USER, jurisdictionId: KATSINA });
    await g.canActivate(context(req));

    expect(resolvePhone).toHaveBeenCalledWith(USER, DEVICE);
    expect(getPrincipal(req as never)).toMatchObject({
      userId: USER,
      deviceId: DEVICE,
      roles: ["inspector"],
      jurisdictionId: KATSINA,
    });
  });

  it("refuses a phone that has been signed out, immediately", async () => {
    const { guard: g } = guard(null);
    const refused = g.canActivate(context({ headers: { authorization: "Bearer t" } }));
    await expect(refused).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(refused).rejects.toMatchObject({
      response: { reason: "phone_signed_out" },
    });
  });
});

// ---- activation, over a database that behaves like the real one -----------

interface Invite {
  id: string;
  user_id: string;
  jurisdiction_id: string | null;
  code_hash: string;
  expires_at: Date;
  used_at: Date | null;
  used_device_id: string | null;
  cancelled_at: Date | null;
}

interface Device {
  id: string;
  assigned_user_id: string;
  public_key: Buffer;
  status: string;
}

class FakeDb {
  invites: Invite[] = [];
  devices: Device[] = [];
  users = new Map([
    [USER, { full_name: "Aisha Bello", status: "active", jurisdiction_id: KATSINA }],
    [OTHER_USER, { full_name: "Musa Danjuma", status: "active", jurisdiction_id: KATSINA }],
  ]);

  addInvite(code: string, patch: Partial<Invite> = {}): Invite {
    const invite: Invite = {
      id: `inv-${this.invites.length + 1}`,
      user_id: USER,
      jurisdiction_id: KATSINA,
      code_hash: hashInviteCode(normalizeInviteCode(code)!, SECRET),
      expires_at: new Date(Date.now() + 3_600_000),
      used_at: null,
      used_device_id: null,
      cancelled_at: null,
      ...patch,
    };
    this.invites.push(invite);
    return invite;
  }

  client = {
    query: async (text: string, params: unknown[] = []) => {
      if (text.includes("FROM invitation i") && text.includes("code_hash = $1")) {
        const invite = this.invites.find((i) => i.code_hash === params[0]);
        if (!invite) return { rows: [], rowCount: 0 };
        const user = this.users.get(invite.user_id)!;
        return {
          rows: [
            {
              ...invite,
              full_name: user.full_name,
              user_status: user.status,
              user_jurisdiction: user.jurisdiction_id,
            },
          ],
          rowCount: 1,
        };
      }
      if (text.includes("FROM device WHERE public_key = $1")) {
        const rows = this.devices.filter((d) => d.public_key.equals(params[0] as Buffer));
        return { rows, rowCount: rows.length };
      }
      if (text.includes("INSERT INTO device")) {
        const device: Device = {
          id: DEVICE,
          assigned_user_id: params[1] as string,
          public_key: params[2] as Buffer,
          status: "active",
        };
        this.devices.push(device);
        return { rows: [{ id: device.id }], rowCount: 1 };
      }
      if (text.includes("UPDATE device SET status = 'active'")) {
        const device = this.devices.find((d) => d.id === params[0])!;
        device.status = "active";
        return { rows: [], rowCount: 1 };
      }
      if (text.includes("UPDATE invitation SET used_at")) {
        const invite = this.invites.find((i) => i.id === params[0])!;
        invite.used_at = new Date();
        invite.used_device_id = params[1] as string;
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`unexpected query: ${text.slice(0, 60)}`);
    },
  };

  pg = {
    transaction: async <T>(fn: (client: unknown) => Promise<T>) => fn(this.client),
    query: async () => [],
  };
}

function service(db: FakeDb, overrides: Partial<InviteConfig> = {}) {
  return new InvitationsService(db.pg as never, {} as never, appConfig(overrides));
}

describe("spending a code", () => {
  it("registers the phone active and hands back a session for it", async () => {
    const db = new FakeDb();
    const invite = db.addInvite("K7PM-4XQ2");

    const result = await service(db).activate({ code: "k7pm 4xq2", publicKeyBase64: KEY });

    expect(result).toMatchObject({ userId: USER, fullName: "Aisha Bello", deviceId: DEVICE });
    expect(db.devices).toHaveLength(1);
    expect(db.devices[0]).toMatchObject({ assigned_user_id: USER, status: "active" });
    expect(invite.used_device_id).toBe(DEVICE);
    expect(verifyDeviceSession(result.token, SECRET)).toMatchObject({ sub: USER, device_id: DEVICE });
  });

  it("works once", async () => {
    const db = new FakeDb();
    db.addInvite("K7PM-4XQ2");
    await service(db).activate({ code: "K7PM-4XQ2", publicKeyBase64: KEY });

    const again = service(db).activate({ code: "K7PM-4XQ2", publicKeyBase64: KEY });
    await expect(again).rejects.toBeInstanceOf(GoneException);
    await expect(again).rejects.toMatchObject({ response: { reason: "already_used" } });
  });

  it("refuses a wrong code, a replaced code and a malformed one the same way", async () => {
    const db = new FakeDb();
    db.addInvite("K7PM-4XQ2", { cancelled_at: new Date() });

    for (const code of ["K7PM-4XQ2", "AAAA-BBBB", "nonsense"]) {
      const refused = service(db).activate({ code, publicKeyBase64: KEY });
      await expect(refused).rejects.toBeInstanceOf(BadRequestException);
      await expect(refused).rejects.toMatchObject({ response: { reason: "invalid_code" } });
    }
    expect(db.devices).toHaveLength(0);
  });

  it("refuses an expired code and says what to do", async () => {
    const db = new FakeDb();
    db.addInvite("K7PM-4XQ2", { expires_at: new Date(Date.now() - 1000) });
    const refused = service(db).activate({ code: "K7PM-4XQ2", publicKeyBase64: KEY });
    await expect(refused).rejects.toMatchObject({
      response: { reason: "expired", message: expect.stringContaining("new one") },
    });
  });

  it("refuses a suspended person's code", async () => {
    const db = new FakeDb();
    db.users.get(USER)!.status = "suspended";
    db.addInvite("K7PM-4XQ2");
    await expect(
      service(db).activate({ code: "K7PM-4XQ2", publicKeyBase64: KEY }),
    ).rejects.toMatchObject({ response: { reason: "account_inactive" } });
  });

  it("will not hand one inspector's phone to another", async () => {
    const db = new FakeDb();
    db.devices.push({
      id: "someone-elses-phone",
      assigned_user_id: OTHER_USER,
      public_key: Buffer.from(KEY, "base64"),
      status: "active",
    });
    db.addInvite("K7PM-4XQ2");
    const refused = service(db).activate({ code: "K7PM-4XQ2", publicKeyBase64: KEY });
    await expect(refused).rejects.toBeInstanceOf(ConflictException);
    await expect(refused).rejects.toMatchObject({ response: { reason: "key_in_use" } });
  });

  it("will not undo a remote sign-out", async () => {
    const db = new FakeDb();
    db.devices.push({
      id: "lost-phone",
      assigned_user_id: USER,
      public_key: Buffer.from(KEY, "base64"),
      status: "revoked",
    });
    db.addInvite("K7PM-4XQ2");
    await expect(
      service(db).activate({ code: "K7PM-4XQ2", publicKeyBase64: KEY }),
    ).rejects.toMatchObject({ response: { reason: "device_signed_out" } });
    expect(db.devices[0]!.status).toBe("revoked");
  });

  it("gives a reinstalled phone its own device back rather than a second one", async () => {
    const db = new FakeDb();
    db.devices.push({
      id: "same-phone",
      assigned_user_id: USER,
      public_key: Buffer.from(KEY, "base64"),
      status: "active",
    });
    db.addInvite("K7PM-4XQ2");
    const result = await service(db).activate({ code: "K7PM-4XQ2", publicKeyBase64: KEY });
    expect(result.deviceId).toBe("same-phone");
    expect(db.devices).toHaveLength(1);
  });

  it("refuses to run at all without a device secret", async () => {
    const db = new FakeDb();
    await expect(
      service(db, { deviceTokenSecret: null }).activate({ code: "K7PM-4XQ2", publicKeyBase64: KEY }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
