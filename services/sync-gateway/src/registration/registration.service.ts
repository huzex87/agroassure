import { createHash, randomBytes, randomInt } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { base64ToBytes, type Role } from "@agroassure/domain";
import { PgService } from "../db/pg.service";
import { CONFIG, type AppConfig } from "../config/config";
import type { Principal } from "../common/principal";
import { isUnscoped, jurisdictionFilter } from "../common/rbac";
import { InviteDelivery, normalizePhone } from "../invitations/delivery";
import { DEVICE_SESSION_TTL_SECONDS, signDeviceSession } from "../invitations/device-session";

// People asking to join, and an administrator deciding.
//
// A registration proves two things before anyone looks at it: that the email
// is the person's and that the phone is — each by a code sent to it. Only then
// does it reach the Team page, where an administrator chooses a role and
// approves, or rejects with a reason. Nothing is granted before that decision.
//
// A registration from the phone app brings the phone's public key with it, so
// approval can make that exact phone an active, attributable device at once.
// The phone learns it has been approved by asking with a status token only it
// holds; the answer carries its session. No invite code is involved.

export const CODE_TTL_MINUTES = 30;
const MAX_CODE_ATTEMPTS = 8;
const MAX_SENDS = 5;
const RESEND_AFTER_MS = 60_000;

export const APPROVABLE_ROLES: Role[] = [
  "inspector",
  "desk_supervisor",
  "authorising_officer",
  "state_admin",
  "auditor",
  "national_admin",
];

export type RegistrationKind = "inspector" | "office";

export interface StartInput {
  fullName: string;
  email: string;
  phone: string;
  jurisdictionId: string;
  source: "app" | "console";
  publicKeyBase64?: string;
}

function sixDigits(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashCode(registrationId: string, channel: "email" | "sms", code: string): string {
  return createHash("sha256").update(`regcode:${registrationId}:${channel}:${code.trim()}`).digest("hex");
}

export function hashStatusToken(token: string): string {
  return createHash("sha256").update(`regstatus:${token}`).digest("hex");
}

function refuse(Kind: new (body: object) => Error, reason: string, message: string): never {
  throw new Kind({ message, reason });
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/** A short email, laid out like the platform's others. */
function mail(subject: string, heading: string, lines: string[], action?: { label: string; href: string }) {
  const text = [heading, "", ...lines, ...(action ? ["", `${action.label}: ${action.href}`] : [])].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#F6FAFC;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#072435">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border:1px solid #E4EDF3;border-radius:16px">
<tr><td style="padding:28px">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="width:36px;height:36px;background:#2F93EC;border-radius:10px;color:#fff;font-weight:700;font-size:18px;text-align:center">A</td>
<td style="padding-left:10px;font-weight:600;font-size:16px">AgroAssure</td></tr></table>
<h1 style="margin:22px 0 10px;font-size:20px">${escape(heading)}</h1>
${lines.map((l) => `<p style="margin:0 0 10px;font-size:15px;line-height:1.55;color:#4A6B7C">${escape(l)}</p>`).join("")}
${action ? `<p style="margin:18px 0 0"><a href="${escape(action.href)}" style="display:inline-block;background:#2F93EC;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:12px">${escape(action.label)}</a></p>` : ""}
</td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}

interface RegistrationRow {
  id: string;
  jurisdiction_id: string;
  full_name: string;
  email: string;
  phone: string;
  kind: RegistrationKind;
  source: "app" | "console";
  public_key: Buffer | null;
  email_code_hash: string | null;
  sms_code_hash: string | null;
  codes_sent_at: Date | null;
  codes_sent_count: number;
  code_attempts: number;
  email_verified_at: Date | null;
  phone_verified_at: Date | null;
  status: "verifying" | "pending" | "approved" | "rejected" | "withdrawn";
  reject_reason: string | null;
  user_id: string | null;
  device_id: string | null;
  decided_role: string | null;
}

@Injectable()
export class RegistrationService {
  private readonly logger = new Logger("Registration");

  constructor(
    private readonly pg: PgService,
    private readonly delivery: InviteDelivery,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Whether this server takes registrations. Both channels must be able to
   * deliver a code: a registration nobody can verify is one nobody can finish.
   */
  available(): boolean {
    const { email, sms } = this.config.invites;
    return this.config.selfRegistration && email.provider !== "none" && sms.provider !== "none";
  }

  private assertAvailable(): void {
    if (!this.available()) {
      refuse(ServiceUnavailableException, "registration_closed", "Registration is not open on this server. Ask your administrator to add you.");
    }
  }

  /** What the registration form needs: whether it is open, and the states to choose from. */
  async options() {
    const jurisdictions = await this.pg.query<{ id: string; name: string }>(
      `SELECT id, name FROM jurisdiction ORDER BY name`,
    );
    return {
      available: this.available(),
      jurisdictions,
      consoleSignIn: this.config.emailSignIn !== null,
    };
  }

  // ---- the registrant -----------------------------------------------------

  async start(input: StartInput): Promise<{ registrationId: string; token: string }> {
    this.assertAvailable();

    const fullName = input.fullName.trim();
    if (fullName.length < 3) refuse(BadRequestException, "invalid_name", "Enter your full name.");
    const email = input.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      refuse(BadRequestException, "invalid_email", "That email address doesn't look right.");
    }
    const phone = normalizePhone(input.phone, this.config.invites.sms.defaultCountryCode);
    if (!phone) {
      refuse(BadRequestException, "invalid_phone", "That phone number doesn't look right. Include the full number, e.g. 0803 123 4567.");
    }

    let publicKey: Buffer | null = null;
    if (input.source === "app") {
      if (!input.publicKeyBase64) refuse(BadRequestException, "missing_key", "The app did not send its key.");
      let bytes: Uint8Array;
      try {
        bytes = base64ToBytes(input.publicKeyBase64);
      } catch {
        refuse(BadRequestException, "invalid_key", "publicKeyBase64 is not valid base64");
      }
      if (bytes.length !== 32) refuse(BadRequestException, "invalid_key", "an ed25519 public key is 32 bytes");
      publicKey = Buffer.from(bytes);
    }

    const [place] = await this.pg.query(`SELECT 1 FROM jurisdiction WHERE id = $1`, [input.jurisdictionId]);
    if (!place) refuse(BadRequestException, "invalid_state", "Choose the state you work in.");

    const [existing] = await this.pg.query(
      `SELECT 1 FROM app_user WHERE lower(email) = $1`,
      [email],
    );
    if (existing) {
      refuse(ConflictException, "account_exists", "An account with this email already exists. Sign in instead, or ask your administrator.");
    }
    if (publicKey) {
      const [taken] = await this.pg.query(`SELECT 1 FROM device WHERE public_key = $1`, [publicKey]);
      if (taken) refuse(ConflictException, "key_in_use", "This phone is already set up for someone. Sign out on the phone first.");
    }

    const token = randomBytes(32).toString("base64url");
    const emailCode = sixDigits();
    const smsCode = sixDigits();

    const registrationId = await this.pg.transaction(async (client) => {
      // Asking again replaces an unfinished request rather than piling up beside it.
      await client.query(
        `UPDATE registration SET status = 'withdrawn'
          WHERE lower(email) = $1 AND status IN ('verifying', 'pending')`,
        [email],
      );
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO registration (jurisdiction_id, full_name, email, phone, kind, source, public_key,
                                   status_token_hash, codes_sent_at, codes_sent_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now(), 1) RETURNING id`,
        [
          input.jurisdictionId,
          fullName,
          email,
          phone,
          input.source === "app" ? "inspector" : "office",
          input.source,
          publicKey,
          hashStatusToken(token),
        ],
      );
      const id = inserted.rows[0]!.id;
      await client.query(
        `UPDATE registration SET email_code_hash = $2, sms_code_hash = $3 WHERE id = $1`,
        [id, hashCode(id, "email", emailCode), hashCode(id, "sms", smsCode)],
      );
      return id;
    });

    await this.sendCodes(email, phone, emailCode, smsCode);
    return { registrationId, token };
  }

  private async sendCodes(email: string | null, phone: string | null, emailCode: string | null, smsCode: string | null) {
    await Promise.all([
      email && emailCode
        ? this.delivery.sendEmailContent(
            email,
            mail("Your AgroAssure verification code", `Your code is ${emailCode}`, [
              "Enter this code to confirm your email address and finish asking to join AgroAssure.",
              `It expires in ${CODE_TTL_MINUTES} minutes. If you didn't ask to join, ignore this email.`,
            ]),
          )
        : null,
      phone && smsCode
        ? this.delivery.sendSmsText(
            phone,
            `AgroAssure: your verification code is ${smsCode}. It expires in ${CODE_TTL_MINUTES} minutes.`,
          )
        : null,
    ]);
  }

  private async load(registrationId: string, token: string): Promise<RegistrationRow> {
    const [row] = await this.pg.query<RegistrationRow>(
      `SELECT * FROM registration WHERE id = $1 AND status_token_hash = $2`,
      [registrationId, hashStatusToken(token)],
    );
    if (!row) refuse(NotFoundException, "not_found", "We couldn't find that request. Start again.");
    return row;
  }

  /** Check either code or both. Pending once both are right. */
  async verify(input: { registrationId: string; token: string; emailCode?: string; smsCode?: string }) {
    const row = await this.load(input.registrationId, input.token);
    if (row.status !== "verifying") return this.describe(row);
    if (row.code_attempts >= MAX_CODE_ATTEMPTS) {
      refuse(GoneException, "too_many_attempts", "Too many wrong codes. Ask for new codes.");
    }
    if (!row.codes_sent_at || row.codes_sent_at.getTime() + CODE_TTL_MINUTES * 60_000 < Date.now()) {
      refuse(GoneException, "codes_expired", "Those codes have expired. Ask for new codes.");
    }

    const wrong: string[] = [];
    let emailOk = row.email_verified_at !== null;
    let phoneOk = row.phone_verified_at !== null;
    if (input.emailCode && !emailOk) {
      if (hashCode(row.id, "email", input.emailCode) === row.email_code_hash) emailOk = true;
      else wrong.push("email");
    }
    if (input.smsCode && !phoneOk) {
      if (hashCode(row.id, "sms", input.smsCode) === row.sms_code_hash) phoneOk = true;
      else wrong.push("sms");
    }

    const bothDone = emailOk && phoneOk;
    const [updated] = await this.pg.query<RegistrationRow>(
      `UPDATE registration
          SET email_verified_at = CASE WHEN $2 THEN coalesce(email_verified_at, now()) END,
              phone_verified_at = CASE WHEN $3 THEN coalesce(phone_verified_at, now()) END,
              code_attempts = code_attempts + $4,
              status = CASE WHEN $2 AND $3 THEN 'pending' ELSE status END
        WHERE id = $1 RETURNING *`,
      [row.id, emailOk, phoneOk, wrong.length > 0 ? 1 : 0],
    );

    if (wrong.length > 0) {
      const which = wrong.length === 2 ? "Both codes are" : wrong[0] === "email" ? "The email code is" : "The SMS code is";
      throw new BadRequestException({ message: `${which} not right. Check and try again.`, reason: "wrong_code", wrong });
    }
    if (bothDone) void this.tellAdministrators(updated!);
    return this.describe(updated!);
  }

  async resend(input: { registrationId: string; token: string }) {
    const row = await this.load(input.registrationId, input.token);
    if (row.status !== "verifying") return this.describe(row);
    if (row.codes_sent_count >= MAX_SENDS) {
      throw new HttpException(
        { message: "Too many codes sent. Start again in a while.", reason: "too_many_sends" },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (row.codes_sent_at && Date.now() - row.codes_sent_at.getTime() < RESEND_AFTER_MS) {
      throw new HttpException(
        { message: "Please wait a minute before asking for new codes.", reason: "too_soon" },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const emailCode = row.email_verified_at ? null : sixDigits();
    const smsCode = row.phone_verified_at ? null : sixDigits();
    await this.pg.query(
      `UPDATE registration
          SET email_code_hash = coalesce($2, email_code_hash),
              sms_code_hash = coalesce($3, sms_code_hash),
              codes_sent_at = now(), codes_sent_count = codes_sent_count + 1, code_attempts = 0
        WHERE id = $1`,
      [row.id, emailCode && hashCode(row.id, "email", emailCode), smsCode && hashCode(row.id, "sms", smsCode)],
    );
    await this.sendCodes(emailCode ? row.email : null, smsCode ? row.phone : null, emailCode, smsCode);
    return this.describe({ ...row, codes_sent_at: new Date() });
  }

  /**
   * Where a request stands. Once an app registration is approved the answer
   * includes the phone's session — the same thing an invite code would have
   * produced — so the waiting screen can move straight on.
   */
  async status(input: { registrationId: string; token: string }) {
    return this.describe(await this.load(input.registrationId, input.token), true);
  }

  private describe(row: RegistrationRow, withSession = false) {
    const base = {
      status: row.status,
      kind: row.kind,
      fullName: row.full_name,
      emailVerified: row.email_verified_at !== null,
      phoneVerified: row.phone_verified_at !== null,
      rejectReason: row.status === "rejected" ? row.reject_reason : null,
      role: row.status === "approved" ? row.decided_role : null,
    };
    if (!withSession || row.status !== "approved" || !row.device_id || !row.user_id) return base;
    const secret = this.config.invites.deviceTokenSecret;
    if (!secret) return base;
    return {
      ...base,
      session: {
        token: signDeviceSession(row.user_id, row.device_id, secret),
        expiresIn: DEVICE_SESSION_TTL_SECONDS,
        userId: row.user_id,
        deviceId: row.device_id,
        fullName: row.full_name,
      },
    };
  }

  // ---- the administrator --------------------------------------------------

  async list(principal: Principal, status = "pending") {
    return this.pg.query(
      `SELECT r.id, r.full_name, r.email, r.phone, r.kind, r.source, r.status,
              (r.public_key IS NOT NULL) AS brings_phone,
              r.email_verified_at, r.phone_verified_at, r.created_at,
              r.decided_at, r.decided_role, r.reject_reason,
              j.name AS jurisdiction_name
         FROM registration r
         JOIN jurisdiction j ON j.id = r.jurisdiction_id
        WHERE r.status = $2 AND ($1::uuid IS NULL OR r.jurisdiction_id = $1)
        ORDER BY r.created_at`,
      [jurisdictionFilter(principal), status],
    );
  }

  async approve(principal: Principal, registrationId: string, role: Role) {
    if (!APPROVABLE_ROLES.includes(role)) throw new BadRequestException("choose a role");
    if (role === "national_admin" && !principal.roles.includes("national_admin")) {
      throw new ForbiddenException("Only a national administrator can grant that role.");
    }

    const done = await this.pg.transaction(async (client) => {
      const found = await client.query<RegistrationRow>(
        `SELECT * FROM registration WHERE id = $1 FOR UPDATE`,
        [registrationId],
      );
      const row = found.rows[0];
      if (!row) throw new NotFoundException("request to join");
      if (!isUnscoped(principal) && row.jurisdiction_id !== principal.jurisdictionId) {
        throw new ForbiddenException("That request is for another state.");
      }
      if (row.status !== "pending") {
        throw new ConflictException(
          row.status === "verifying"
            ? "This person hasn't confirmed their email and phone yet."
            : "This request has already been decided.",
        );
      }
      const clash = await client.query(
        `SELECT 1 FROM app_user WHERE lower(email) = lower($1)`,
        [row.email],
      );
      if (clash.rowCount) throw new ConflictException("Someone with this email already has an account.");

      const user = await client.query<{ id: string }>(
        `INSERT INTO app_user (jurisdiction_id, full_name, email, phone) VALUES ($1,$2,$3,$4) RETURNING id`,
        [row.jurisdiction_id, row.full_name, row.email, row.phone],
      );
      const userId = user.rows[0]!.id;
      await client.query(
        `INSERT INTO user_role (user_id, role_code, jurisdiction_id) VALUES ($1,$2,$3)`,
        [userId, role, role === "national_admin" ? null : row.jurisdiction_id],
      );

      // The phone that asked becomes the inspector's phone, if the role is one
      // that works from a phone.
      let deviceId: string | null = null;
      if (row.public_key && role === "inspector") {
        const taken = await client.query(`SELECT 1 FROM device WHERE public_key = $1`, [row.public_key]);
        if (taken.rowCount) throw new ConflictException("That phone has since been set up for someone else.");
        const device = await client.query<{ id: string }>(
          `INSERT INTO device (jurisdiction_id, assigned_user_id, public_key, label, status, last_seen_at)
           VALUES ($1,$2,$3,'Registered phone','active', now()) RETURNING id`,
          [row.jurisdiction_id, userId, row.public_key],
        );
        deviceId = device.rows[0]!.id;
      }

      await client.query(
        `UPDATE registration
            SET status = 'approved', decided_by = $2, decided_at = now(), decided_role = $3,
                user_id = $4, device_id = $5
          WHERE id = $1`,
        [row.id, principal.userId, role, userId, deviceId],
      );
      return { row, userId, deviceId };
    });

    void this.tellRegistrant(done.row, true, role);
    return { userId: done.userId, deviceId: done.deviceId };
  }

  async reject(principal: Principal, registrationId: string, reason: string | null) {
    const rows = await this.pg.query<RegistrationRow>(
      `UPDATE registration
          SET status = 'rejected', decided_by = $3, decided_at = now(), reject_reason = $4
        WHERE id = $1 AND status IN ('verifying', 'pending')
          AND ($2::uuid IS NULL OR jurisdiction_id = $2)
        RETURNING *`,
      [registrationId, jurisdictionFilter(principal), principal.userId, reason],
    );
    if (rows.length === 0) throw new NotFoundException("open request to join");
    void this.tellRegistrant(rows[0]!, false, null);
  }

  // ---- telling people -----------------------------------------------------

  private async tellRegistrant(row: RegistrationRow, approved: boolean, role: string | null) {
    const first = row.full_name.split(/\s+/)[0] ?? row.full_name;
    const consoleUrl = this.config.emailSignIn?.consoleUrl;
    try {
      if (approved) {
        const fromApp = row.source === "app" && role === "inspector";
        const lines = fromApp
          ? ["Your request to join AgroAssure has been approved.", "Open the AgroAssure app on your phone to continue."]
          : ["Your request to join AgroAssure has been approved.", "You can now sign in to the AgroAssure console with this email address."];
        await Promise.all([
          this.delivery.sendEmailContent(
            row.email,
            mail("You're approved on AgroAssure", `Welcome, ${first}`, lines,
              !fromApp && consoleUrl ? { label: "Sign in", href: `${consoleUrl}/signin` } : undefined),
          ),
          this.delivery.sendSmsText(
            row.phone,
            fromApp
              ? "AgroAssure: you're approved. Open the AgroAssure app to continue."
              : "AgroAssure: you're approved. Sign in to the console with your email.",
          ),
        ]);
      } else {
        const lines = [
          "Your request to join AgroAssure was not approved.",
          ...(row.reject_reason ? [`Reason: ${row.reject_reason}`] : []),
          "If you think this is a mistake, speak to your administrator.",
        ];
        await Promise.all([
          this.delivery.sendEmailContent(row.email, mail("Your AgroAssure request", `Hello ${first}`, lines)),
          this.delivery.sendSmsText(row.phone, "AgroAssure: your request to join was not approved. Check your email for details."),
        ]);
      }
    } catch (err) {
      this.logger.warn(`could not notify registrant ${row.id}: ${String(err)}`);
    }
  }

  /** A new verified request: tell the people who can approve it, by email. */
  private async tellAdministrators(row: RegistrationRow) {
    try {
      const admins = await this.pg.query<{ email: string }>(
        `SELECT DISTINCT u.email FROM app_user u
           JOIN user_role r ON r.user_id = u.id
          WHERE u.status = 'active' AND u.email IS NOT NULL
            AND ((r.role_code = 'state_admin' AND u.jurisdiction_id = $1) OR r.role_code = 'national_admin')`,
        [row.jurisdiction_id],
      );
      const consoleUrl = this.config.emailSignIn?.consoleUrl;
      const what = row.kind === "inspector" ? "work as a field inspector" : "work in the office";
      await Promise.all(
        admins.map((a) =>
          this.delivery.sendEmailContent(
            a.email,
            mail("New request to join AgroAssure", `${row.full_name} asked to join`, [
              `${row.full_name} has confirmed their email and phone and is asking to ${what}.`,
              "Review the request on the Team page, choose their role, and approve or reject it.",
            ], consoleUrl ? { label: "Review request", href: `${consoleUrl}/team` } : undefined),
          ),
        ),
      );
    } catch (err) {
      this.logger.warn(`could not notify administrators of ${row.id}: ${String(err)}`);
    }
  }
}
