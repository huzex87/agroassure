import { describe, it, expect, beforeAll } from "vitest";
import { bytesToBase64, derivePublicKey } from "@agroassure/domain";
import type { AppConfig, InviteConfig } from "../../src/config/config";
import { PgService } from "../../src/db/pg.service";
import { UserDirectory } from "../../src/common/user-directory";
import type { InviteDelivery, InviteMessage } from "../../src/invitations/delivery";
import { InvitationsService } from "../../src/invitations/invitations.service";
import { verifyDeviceSession } from "../../src/invitations/device-session";
import { RegistrationService } from "../../src/registration/registration.service";
import type { Principal } from "../../src/common/principal";

// Someone asking to join, as the database sees it: a request, both contacts
// proven by a code each, a place in the Team page's queue, and a decision. For
// a phone, approval makes that exact phone the inspector's at once, and the
// waiting screen's next question comes back with a working session.

const DATABASE_URL = process.env.DATABASE_URL;
const ALLOWED = process.env.ALLOW_DESTRUCTIVE_TEST_DB === "1";
const runIf = DATABASE_URL && ALLOWED ? describe : describe.skip;

const SECRET = "integration-device-session-secret-32+chars";

function key(seed: number): string {
  const k = new Uint8Array(32);
  for (let i = 0; i < 32; i++) k[i] = (i * seed + 29) & 0xff;
  return bytesToBase64(derivePublicKey(k));
}

/** Delivery that keeps what it would have sent, so the test can read the codes. */
class Outbox {
  emails: { to: string; subject: string; text: string }[] = [];
  sms: { to: string; text: string }[] = [];
  async sendEmailContent(to: string, m: { subject: string; text: string }) {
    this.emails.push({ to, subject: m.subject, text: m.text });
    return { channel: "email", status: "sent" };
  }
  async sendSmsText(to: string, text: string) {
    this.sms.push({ to, text });
    return { channel: "sms", status: "sent" };
  }
  /** The invite-code path, which approval uses for an inspector with no phone yet. */
  invites: { to: string | null; code: string }[] = [];
  async sendEmail(to: string | null, m: InviteMessage) {
    this.invites.push({ to, code: m.code });
    return { to, status: to ? "sent" : "skipped", detail: null };
  }
  async sendSms(to: string | null, m: InviteMessage) {
    this.invites.push({ to, code: m.code });
    return { to, status: to ? "sent" : "skipped", detail: null };
  }
  emailCodeFor(to: string): string {
    const m = [...this.emails].reverse().find((e) => e.to === to && /code is (\d{6})/.test(e.text));
    return /code is (\d{6})/.exec(m!.text)![1]!;
  }
  smsCodeFor(to: string): string {
    const m = [...this.sms].reverse().find((s) => s.to === to && /code is (\d{6})/.test(s.text));
    return /code is (\d{6})/.exec(m!.text)![1]!;
  }
}

runIf("asking to join, end to end", () => {
  let pg: PgService;
  let outbox: Outbox;
  let registrations: RegistrationService;
  let directory: UserDirectory;
  let stateAdmin: Principal;
  let otherStateAdmin: Principal;
  let jurisdictionId: string;
  let adminEmail: string;
  const stamp = Date.now();

  beforeAll(async () => {
    const invites: InviteConfig = {
      deviceTokenSecret: SECRET,
      ttlHours: 72,
      appDownloadUrl: null,
      email: { provider: "log", apiKey: null, from: null },
      sms: {
        provider: "log",
        apiKey: null,
        senderId: null,
        account: null,
        channel: "dnd",
        defaultCountryCode: "234",
      },
    };
    const config = {
      databaseUrl: DATABASE_URL,
      invites,
      selfRegistration: true,
      emailSignIn: { consoleUrl: "https://console.example", sessionSecret: "x".repeat(32), linkTtlMinutes: 15 },
    } as AppConfig;
    pg = new PgService(config);
    outbox = new Outbox();
    const delivery = outbox as unknown as InviteDelivery;
    registrations = new RegistrationService(pg, delivery, config, new InvitationsService(pg, delivery, config));
    directory = new UserDirectory(pg);

    const code = `R${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    jurisdictionId = (
      await pg.query<{ id: string }>(
        `INSERT INTO jurisdiction (name, code) VALUES ($1, $2) RETURNING id`,
        [`Registration ${code}`, code],
      )
    )[0]!.id;
    const otherId = (
      await pg.query<{ id: string }>(
        `INSERT INTO jurisdiction (name, code) VALUES ($1, $2) RETURNING id`,
        [`Registration other ${code}`, `${code}X`],
      )
    )[0]!.id;
    adminEmail = `reg.admin.${stamp}@example.org`;
    const adminId = (
      await pg.query<{ id: string }>(
        `INSERT INTO app_user (jurisdiction_id, full_name, email) VALUES ($1, 'Registration Admin', $2) RETURNING id`,
        [jurisdictionId, adminEmail],
      )
    )[0]!.id;
    await pg.query(`INSERT INTO user_role (user_id, role_code, jurisdiction_id) VALUES ($1, 'state_admin', $2)`, [
      adminId,
      jurisdictionId,
    ]);
    stateAdmin = { userId: adminId, deviceId: null, jurisdictionId, roles: ["state_admin"] };
    otherStateAdmin = { userId: adminId, deviceId: null, jurisdictionId: otherId, roles: ["state_admin"] };
  });

  const phoneEmail = `musa.${stamp}@example.org`;
  const phoneKey = key(7);
  let fromPhone: { registrationId: string; token: string };

  it("lists the states and says it is open", async () => {
    const options = await registrations.options();
    expect(options.available).toBe(true);
    expect(options.jurisdictions.map((j) => j.id)).toContain(jurisdictionId);
  });

  it("takes a request from a phone and sends a code to each contact", async () => {
    fromPhone = await registrations.start({
      fullName: "Musa Ibrahim",
      email: phoneEmail.toUpperCase(),
      phone: "0806 555 0101",
      jurisdictionId,
      source: "app",
      publicKeyBase64: phoneKey,
    });
    expect(outbox.emailCodeFor(phoneEmail)).toMatch(/^\d{6}$/);
    expect(outbox.smsCodeFor("+2348065550101")).toMatch(/^\d{6}$/);

    const [row] = await pg.query<{ status: string; kind: string; email: string; status_token_hash: string }>(
      `SELECT status, kind, email, status_token_hash FROM registration WHERE id = $1`,
      [fromPhone.registrationId],
    );
    expect(row).toMatchObject({ status: "verifying", kind: "inspector", email: phoneEmail });
    // Only the hash of the registrant's token is kept.
    expect(row!.status_token_hash).not.toContain(fromPhone.token);
  });

  it("refuses a wrong code and says which one", async () => {
    await expect(
      registrations.verify({ ...fromPhone, emailCode: "000000", smsCode: outbox.smsCodeFor("+2348065550101") }),
    ).rejects.toMatchObject({ response: { reason: "wrong_code", wrong: ["email"] } });
    // The right SMS code in the same attempt still counted.
    const s = await registrations.status(fromPhone);
    expect(s).toMatchObject({ status: "verifying", phoneVerified: true, emailVerified: false });
  });

  it("is pending once both are proven, and tells the state's administrators", async () => {
    const s = await registrations.verify({ ...fromPhone, emailCode: outbox.emailCodeFor(phoneEmail) });
    expect(s).toMatchObject({ status: "pending", emailVerified: true, phoneVerified: true });
    await new Promise((r) => setTimeout(r, 50));
    expect(outbox.emails.some((e) => e.to === adminEmail && /asked to join/.test(e.subject + e.text))).toBe(true);
  });

  it("shows in the queue of its own state only", async () => {
    const mine = await registrations.list(stateAdmin);
    expect(mine.map((r) => (r as { id: string }).id)).toContain(fromPhone.registrationId);
    expect(mine.find((r) => (r as { id: string }).id === fromPhone.registrationId)).toMatchObject({
      brings_phone: true,
      kind: "inspector",
    });
    const theirs = await registrations.list(otherStateAdmin);
    expect(theirs.map((r) => (r as { id: string }).id)).not.toContain(fromPhone.registrationId);
    await expect(registrations.approve(otherStateAdmin, fromPhone.registrationId, "inspector")).rejects.toThrow(
      /another state/,
    );
  });

  it("does not let a state administrator grant the national role", async () => {
    await expect(
      registrations.approve(stateAdmin, fromPhone.registrationId, "national_admin"),
    ).rejects.toThrow(/national administrator/);
  });

  it("approves as inspector: the phone that asked is the phone that works", async () => {
    const approved = await registrations.approve(stateAdmin, fromPhone.registrationId, "inspector");
    expect(approved.deviceId).toBeTruthy();
    // The phone that asked is already set up: no invite code goes out.
    expect(approved.inviteSent).toBe(false);

    const s = (await registrations.status(fromPhone)) as {
      status: string;
      role: string;
      session?: { token: string; userId: string; deviceId: string };
    };
    expect(s).toMatchObject({ status: "approved", role: "inspector" });
    expect(s.session).toBeDefined();
    const claims = verifyDeviceSession(s.session!.token, SECRET);
    expect(claims.sub).toBe(approved.userId);
    expect(await directory.resolvePhone(approved.userId, approved.deviceId!)).toEqual({
      id: approved.userId,
      jurisdictionId,
    });

    const [roles] = await pg.query<{ roles: string[] }>(
      `SELECT array_agg(role_code) AS roles FROM user_role WHERE user_id = $1`,
      [approved.userId],
    );
    expect(roles!.roles).toEqual(["inspector"]);

    await new Promise((r) => setTimeout(r, 50));
    expect(outbox.sms.some((m) => m.to === "+2348065550101" && /approved/.test(m.text))).toBe(true);
  });

  it("cannot be decided twice, and the email and phone key are now taken", async () => {
    await expect(registrations.approve(stateAdmin, fromPhone.registrationId, "inspector")).rejects.toThrow(
      /already been decided/,
    );
    await expect(
      registrations.start({ fullName: "Musa Again", email: phoneEmail, phone: "08065550102", jurisdictionId, source: "console" }),
    ).rejects.toMatchObject({ response: { reason: "account_exists" } });
    await expect(
      registrations.start({
        fullName: "Someone Else",
        email: `else.${stamp}@example.org`,
        phone: "08065550103",
        jurisdictionId,
        source: "app",
        publicKeyBase64: phoneKey,
      }),
    ).rejects.toMatchObject({ response: { reason: "key_in_use" } });
  });

  const officeEmail = `ngozi.${stamp}@example.org`;
  let fromConsole: { registrationId: string; token: string };

  it("replaces an unfinished request when the same person asks again", async () => {
    const first = await registrations.start({
      fullName: "Ngozi Okafor",
      email: officeEmail,
      phone: "0701 222 3333",
      jurisdictionId,
      source: "console",
    });
    fromConsole = await registrations.start({
      fullName: "Ngozi Okafor",
      email: officeEmail,
      phone: "0701 222 3333",
      jurisdictionId,
      source: "console",
    });
    expect((await registrations.status(first)).status).toBe("withdrawn");
    expect((await registrations.status(fromConsole)).status).toBe("verifying");
  });

  it("will not resend before a minute has passed", async () => {
    await expect(registrations.resend(fromConsole)).rejects.toMatchObject({ response: { reason: "too_soon" } });
  });

  it("refuses a code for the wrong request and a request found by the wrong token", async () => {
    await expect(
      registrations.status({ registrationId: fromConsole.registrationId, token: fromPhone.token }),
    ).rejects.toMatchObject({ response: { reason: "not_found" } });
  });

  it("cannot be approved before both contacts are proven", async () => {
    await expect(registrations.approve(stateAdmin, fromConsole.registrationId, "desk_supervisor")).rejects.toThrow(
      /confirmed their email and phone/,
    );
  });

  it("rejects with a reason the registrant is told", async () => {
    await registrations.verify({
      ...fromConsole,
      emailCode: outbox.emailCodeFor(officeEmail),
      smsCode: outbox.smsCodeFor("+2347012223333"),
    });
    await registrations.reject(stateAdmin, fromConsole.registrationId, "We don't know you — speak to Hauwa.");
    const s = await registrations.status(fromConsole);
    expect(s).toMatchObject({ status: "rejected", rejectReason: "We don't know you — speak to Hauwa." });
    await new Promise((r) => setTimeout(r, 50));
    expect(outbox.emails.some((e) => e.to === officeEmail && /speak to Hauwa/.test(e.text))).toBe(true);
    await expect(registrations.reject(stateAdmin, fromConsole.registrationId, null)).rejects.toThrow();
  });

  it("approves office staff without a phone, for console sign-in", async () => {
    const email = `bala.${stamp}@example.org`;
    const req = await registrations.start({
      fullName: "Bala Usman",
      email,
      phone: "08091112222",
      jurisdictionId,
      source: "console",
    });
    await registrations.verify({
      ...req,
      emailCode: outbox.emailCodeFor(email),
      smsCode: outbox.smsCodeFor("+2348091112222"),
    });
    const approved = await registrations.approve(stateAdmin, req.registrationId, "desk_supervisor");
    expect(approved.deviceId).toBeNull();
    const s = await registrations.status(req);
    expect(s).toMatchObject({ status: "approved", role: "desk_supervisor" });
    expect("session" in s).toBe(false);
    expect(await directory.resolveConsoleUser(approved.userId)).toMatchObject({ roles: ["desk_supervisor"] });
    expect(approved.inviteSent).toBe(false);
  });

  it("sends an invite code at once to an inspector who asked on the website", async () => {
    const email = `hauwa.${stamp}@example.org`;
    const req = await registrations.start({
      fullName: "Hauwa Sani",
      email,
      phone: "08093334444",
      jurisdictionId,
      source: "console",
    });
    await registrations.verify({
      ...req,
      emailCode: outbox.emailCodeFor(email),
      smsCode: outbox.smsCodeFor("+2348093334444"),
    });
    const approved = await registrations.approve(stateAdmin, req.registrationId, "inspector");
    expect(approved).toMatchObject({ deviceId: null, inviteSent: true });

    // One live code, sent to both proven contacts, ready to type into the app.
    const live = await pg.query<{ email_to: string; sms_to: string }>(
      `SELECT email_to, sms_to FROM invitation WHERE user_id = $1 AND used_at IS NULL AND cancelled_at IS NULL`,
      [approved.userId],
    );
    expect(live).toEqual([{ email_to: email, sms_to: "+2348093334444" }]);
    const sent = outbox.invites.filter((i) => i.to === email || i.to === "+2348093334444");
    expect(sent).toHaveLength(2);
    expect(sent[0]!.code).toMatch(/^[A-Z2-9]{4}-?[A-Z2-9]{4}$/);

    await new Promise((r) => setTimeout(r, 50));
    expect(outbox.emails.some((e) => e.to === email && /separate message with a code/.test(e.text))).toBe(true);
  });
});
