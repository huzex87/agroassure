import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { PoolClient } from "pg";
import QRCode from "qrcode";
import { base64ToBytes } from "@agroassure/domain";
import { PgService } from "../db/pg.service";
import { CONFIG, type AppConfig } from "../config/config";
import type { Principal } from "../common/principal";
import { isUnscoped, jurisdictionFilter } from "../common/rbac";
import {
  activationLink,
  formatInviteCode,
  hashInviteCode,
  newInviteCode,
  normalizeInviteCode,
} from "./invite-code";
import { InviteDelivery, normalizePhone, type ChannelOutcome } from "./delivery";
import { DEVICE_SESSION_TTL_SECONDS, signDeviceSession } from "./device-session";

// Inviting an inspector, and a phone spending the invitation.
//
// The administrator's decision — this person may bring a phone into service —
// is taken here, when the invitation is issued. The phone spending the code is
// the approval being used, not a request for one: its key is registered active
// in the same transaction that marks the code spent, so there is no state in
// which a phone waits for somebody to notice it.

const ED25519_PUBLIC_KEY_BYTES = 32;

export interface InviteInput {
  fullName: string;
  email?: string;
  phone?: string;
  jurisdictionId?: string;
}

export interface IssuedInvitation {
  invitationId: string;
  userId: string;
  fullName: string;
  /** Shown once, to the administrator who issued it. Only its HMAC is stored. */
  code: string;
  link: string;
  /** The link as a QR code, for scanning off the administrator's screen. */
  qrSvg: string;
  expiresAt: string;
  email: ChannelOutcome;
  sms: ChannelOutcome;
}

export interface Activation {
  token: string;
  expiresIn: number;
  userId: string;
  fullName: string;
  deviceId: string;
}

/** Why a code was refused, for the phone to act on without parsing a sentence. */
export type ActivationRefusal =
  | "invalid_code"
  | "expired"
  | "already_used"
  | "account_inactive"
  | "key_in_use"
  | "device_signed_out";

function refuse(
  Kind: new (body: object) => Error,
  reason: ActivationRefusal,
  message: string,
): never {
  throw new Kind({ message, reason });
}

@Injectable()
export class InvitationsService {
  constructor(
    private readonly pg: PgService,
    private readonly delivery: InviteDelivery,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  private secret(): string {
    const secret = this.config.invites.deviceTokenSecret;
    if (!secret) {
      throw new ServiceUnavailableException(
        "phone invitations are not set up on this server: DEVICE_TOKEN_SECRET is missing",
      );
    }
    return secret;
  }

  // ---- issuing ------------------------------------------------------------

  /** A new inspector: create them, and send their first code. */
  async invite(principal: Principal, input: InviteInput): Promise<IssuedInvitation> {
    this.secret();
    const email = input.email?.trim().toLowerCase() || undefined;
    const phone = input.phone
      ? (normalizePhone(input.phone, this.config.invites.sms.defaultCountryCode) ?? undefined)
      : undefined;
    if (input.phone && !phone) {
      throw new BadRequestException("That phone number doesn't look right. Include the full number, e.g. 0803 123 4567.");
    }
    if (!email && !phone) {
      throw new BadRequestException("Add an email address or a phone number, so the invite code can reach them.");
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException("That email address doesn't look right.");
    }

    const jurisdictionId = this.targetJurisdiction(principal, input.jurisdictionId);

    const issued = await this.pg.transaction(async (client) => {
      if (email) {
        const taken = await client.query(`SELECT 1 FROM app_user WHERE lower(email) = $1`, [email]);
        if (taken.rowCount) {
          throw new ConflictException(
            "Someone with that email is already on the team. Use \"Send new code\" on their row instead.",
          );
        }
      }
      const user = await client.query<{ id: string }>(
        `INSERT INTO app_user (jurisdiction_id, full_name, email, phone)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [jurisdictionId, input.fullName.trim(), email ?? null, phone ?? null],
      );
      const userId = user.rows[0]!.id;
      await client.query(
        `INSERT INTO user_role (user_id, role_code, jurisdiction_id) VALUES ($1,'inspector',$2)
         ON CONFLICT DO NOTHING`,
        [userId, jurisdictionId],
      );
      return this.issue(client, principal, {
        userId,
        jurisdictionId,
        fullName: input.fullName.trim(),
        email: email ?? null,
        phone: phone ?? null,
      });
    });

    return this.deliver(principal, issued);
  }

  /**
   * A fresh code for someone already on the team: a new phone, a lost SMS, an
   * expired code. Any code still live for them stops working.
   */
  async reinvite(principal: Principal, userId: string): Promise<IssuedInvitation> {
    this.secret();
    const [user] = await this.pg.query<{
      id: string;
      full_name: string;
      email: string | null;
      phone: string | null;
      status: string;
      jurisdiction_id: string | null;
      inspector: boolean;
    }>(
      `SELECT u.id, u.full_name, u.email, u.phone, u.status, u.jurisdiction_id,
              EXISTS (SELECT 1 FROM user_role r WHERE r.user_id = u.id AND r.role_code = 'inspector') AS inspector
         FROM app_user u
        WHERE u.id = $1 AND ($2::uuid IS NULL OR u.jurisdiction_id = $2)`,
      [userId, jurisdictionFilter(principal)],
    );
    if (!user) throw new NotFoundException("team member");
    if (user.status !== "active") throw new ForbiddenException("This person's account is suspended.");
    if (!user.inspector) {
      throw new BadRequestException("Only inspectors use the phone app. Give them the inspector role first.");
    }
    if (!user.email && !user.phone) {
      throw new BadRequestException("This person has no email address or phone number to send a code to.");
    }

    const issued = await this.pg.transaction((client) =>
      this.issue(client, principal, {
        userId: user.id,
        jurisdictionId: user.jurisdiction_id,
        fullName: user.full_name,
        email: user.email,
        phone: user.phone,
      }),
    );
    return this.deliver(principal, issued);
  }

  async cancel(principal: Principal, invitationId: string): Promise<void> {
    const rows = await this.pg.query(
      `UPDATE invitation SET cancelled_at = now()
        WHERE id = $1 AND used_at IS NULL AND cancelled_at IS NULL
          AND ($2::uuid IS NULL OR jurisdiction_id = $2)
       RETURNING id`,
      [invitationId, jurisdictionFilter(principal)],
    );
    if (rows.length === 0) throw new NotFoundException("open invitation");
  }

  /** Invitations still waiting to be used, newest first. */
  async listOpen(principal: Principal) {
    return this.pg.query(
      `SELECT i.id, i.user_id, u.full_name, i.created_at, i.expires_at,
              i.email_to, i.email_status, i.email_detail,
              i.sms_to, i.sms_status, i.sms_detail,
              (i.expires_at < now()) AS expired
         FROM invitation i
         JOIN app_user u ON u.id = i.user_id
        WHERE i.used_at IS NULL AND i.cancelled_at IS NULL
          AND ($1::uuid IS NULL OR i.jurisdiction_id = $1)
        ORDER BY i.created_at DESC`,
      [jurisdictionFilter(principal)],
    );
  }

  private async issue(
    client: PoolClient,
    principal: Principal,
    who: {
      userId: string;
      jurisdictionId: string | null;
      fullName: string;
      email: string | null;
      phone: string | null;
    },
  ): Promise<Omit<IssuedInvitation, "email" | "sms" | "qrSvg">> {
    // One live code per person. Retiring the old one first keeps the partial
    // unique index satisfied and means only the newest message works.
    await client.query(
      `UPDATE invitation SET cancelled_at = now()
        WHERE user_id = $1 AND used_at IS NULL AND cancelled_at IS NULL`,
      [who.userId],
    );

    const code = newInviteCode();
    const normalized = normalizeInviteCode(code)!;
    const expiresAt = new Date(Date.now() + this.config.invites.ttlHours * 60 * 60 * 1000);

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO invitation (jurisdiction_id, user_id, code_hash, created_by, expires_at, email_to, sms_to)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [
        who.jurisdictionId,
        who.userId,
        hashInviteCode(normalized, this.secret()),
        principal.userId,
        expiresAt,
        who.email,
        who.phone,
      ],
    );

    return {
      invitationId: inserted.rows[0]!.id,
      userId: who.userId,
      fullName: who.fullName,
      code,
      link: activationLink(normalized),
      expiresAt: expiresAt.toISOString(),
    };
  }

  /** After the transaction: a slow SMS provider must not hold a database lock. */
  private async deliver(
    principal: Principal,
    issued: Omit<IssuedInvitation, "email" | "sms" | "qrSvg">,
  ): Promise<IssuedInvitation> {
    const [row] = await this.pg.query<{ email_to: string | null; sms_to: string | null }>(
      `SELECT email_to, sms_to FROM invitation WHERE id = $1`,
      [issued.invitationId],
    );
    const [inviter] = await this.pg.query<{ full_name: string }>(
      `SELECT full_name FROM app_user WHERE id = $1`,
      [principal.userId],
    );

    const message = {
      fullName: issued.fullName,
      code: issued.code,
      link: issued.link,
      expiresAt: new Date(issued.expiresAt),
      invitedBy: inviter?.full_name ?? null,
      appDownloadUrl: this.config.invites.appDownloadUrl,
    };
    const [email, sms] = await Promise.all([
      this.delivery.sendEmail(row?.email_to ?? null, message),
      this.delivery.sendSms(row?.sms_to ?? null, message),
    ]);

    await this.pg.query(
      `UPDATE invitation
          SET email_status = $2, email_detail = $3, sms_status = $4, sms_detail = $5
        WHERE id = $1`,
      [issued.invitationId, email.status, email.detail, sms.status, sms.detail],
    );

    const qrSvg = await QRCode.toString(issued.link, {
      type: "svg",
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#0B2A20", light: "#ffffff" },
    });

    return { ...issued, email, sms, qrSvg };
  }

  // ---- spending -----------------------------------------------------------

  /**
   * A phone presenting a code and its public key. On success the phone is an
   * active, attributable device of the invited person, and holds a session.
   */
  async activate(input: {
    code: string;
    publicKeyBase64: string;
    label?: string;
  }): Promise<Activation> {
    const secret = this.secret();
    const normalized = normalizeInviteCode(input.code);
    if (!normalized) {
      refuse(BadRequestException, "invalid_code", "That code isn't right. It has 8 letters and numbers, like K7PM-4XQ2.");
    }
    const publicKey = this.parsePublicKey(input.publicKeyBase64);

    return this.pg.transaction(async (client) => {
      const found = await client.query<{
        id: string;
        user_id: string;
        jurisdiction_id: string | null;
        expires_at: Date;
        used_at: Date | null;
        cancelled_at: Date | null;
        full_name: string;
        user_status: string;
        user_jurisdiction: string | null;
      }>(
        `SELECT i.id, i.user_id, i.jurisdiction_id, i.expires_at, i.used_at, i.cancelled_at,
                u.full_name, u.status AS user_status, u.jurisdiction_id AS user_jurisdiction
           FROM invitation i
           JOIN app_user u ON u.id = i.user_id
          WHERE i.code_hash = $1
          FOR UPDATE OF i`,
        [hashInviteCode(normalized, secret)],
      );
      const invite = found.rows[0];

      // A replaced code reads the same as a wrong one: telling the holder of
      // an old code that it once existed helps nobody.
      if (!invite || invite.cancelled_at) {
        refuse(BadRequestException, "invalid_code", "That code isn't right. Check it and try again, or ask for a new one.");
      }
      if (invite.used_at) {
        refuse(GoneException, "already_used", "This code has already been used. Ask your administrator to send a new one.");
      }
      if (invite.expires_at.getTime() < Date.now()) {
        refuse(GoneException, "expired", "This code has expired. Ask your administrator to send a new one.");
      }
      if (invite.user_status !== "active") {
        refuse(ForbiddenException, "account_inactive", "Your account is not active. Please speak to your administrator.");
      }

      const jurisdictionId = invite.jurisdiction_id ?? invite.user_jurisdiction;
      if (!jurisdictionId) {
        refuse(ForbiddenException, "account_inactive", "Your account has no state assigned. Please speak to your administrator.");
      }

      const existing = await client.query<{ id: string; status: string; assigned_user_id: string | null }>(
        `SELECT id, status, assigned_user_id FROM device WHERE public_key = $1 FOR UPDATE`,
        [Buffer.from(publicKey)],
      );
      let deviceId: string;
      const current = existing.rows[0];
      if (current) {
        // Somebody else's key. Re-pointing it would let a code capture a phone
        // that already signs another inspector's work.
        if (current.assigned_user_id !== invite.user_id) {
          refuse(ConflictException, "key_in_use", "This phone is set up for someone else. Sign out on the phone first.");
        }
        // Signed out remotely. That was a decision about this key — a lost
        // phone, usually — and a code is not a way round it. The app answers
        // by making a new key, which is a new, attributable device.
        if (current.status === "revoked") {
          refuse(ConflictException, "device_signed_out", "This phone was signed out remotely. It needs a fresh start.");
        }
        // Reinstalled, or the session ran out: the same person, the same key.
        await client.query(
          `UPDATE device SET status = 'active', enrolled_at = CASE WHEN status = 'active' THEN enrolled_at ELSE now() END,
                  last_seen_at = now(), label = coalesce($2, label)
            WHERE id = $1`,
          [current.id, input.label ?? null],
        );
        deviceId = current.id;
      } else {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO device (jurisdiction_id, assigned_user_id, public_key, label, status, last_seen_at)
           VALUES ($1,$2,$3,$4,'active', now()) RETURNING id`,
          [jurisdictionId, invite.user_id, Buffer.from(publicKey), input.label ?? null],
        );
        deviceId = inserted.rows[0]!.id;
      }

      await client.query(
        `UPDATE invitation SET used_at = now(), used_device_id = $2 WHERE id = $1`,
        [invite.id, deviceId],
      );

      return {
        token: signDeviceSession(invite.user_id, deviceId, secret),
        expiresIn: DEVICE_SESSION_TTL_SECONDS,
        userId: invite.user_id,
        fullName: invite.full_name,
        deviceId,
      };
    });
  }

  // ---- helpers ------------------------------------------------------------

  private parsePublicKey(base64: string): Uint8Array {
    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(base64);
    } catch {
      throw new BadRequestException("publicKeyBase64 is not valid base64");
    }
    if (bytes.length !== ED25519_PUBLIC_KEY_BYTES) {
      throw new BadRequestException(
        `an ed25519 public key is ${ED25519_PUBLIC_KEY_BYTES} bytes; got ${bytes.length}`,
      );
    }
    return bytes;
  }

  private targetJurisdiction(principal: Principal, requested?: string): string {
    if (isUnscoped(principal)) {
      if (!requested) throw new BadRequestException("jurisdictionId is required for a national role");
      return requested;
    }
    if (!principal.jurisdictionId) throw new ForbiddenException("your account has no jurisdiction");
    if (requested && requested !== principal.jurisdictionId) {
      throw new ForbiddenException("you may only administer your own jurisdiction");
    }
    return principal.jurisdictionId;
  }
}
