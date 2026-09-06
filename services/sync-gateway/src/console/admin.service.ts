import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { base64ToBytes, type Role } from "@agroassure/domain";
import { PgService } from "../db/pg.service";
import type { Principal } from "../common/principal";
import { isUnscoped, jurisdictionFilter } from "../common/rbac";

// Users, roles, and device enrollment. Attribution is structural in this
// platform — who observed a finding, who decided, who authorised — so this is
// where that attribution is made possible in the first place: a person with a
// role scoped to a jurisdiction, and a device whose signature can be checked
// against a key the regulator registered.

/** ed25519 public keys are exactly 32 bytes. Anything else is not one. */
const ED25519_PUBLIC_KEY_BYTES = 32;

export interface CreateUserInput {
  fullName: string;
  email?: string;
  phone?: string;
  /** The subject claim from the institution's identity provider. */
  oidcSubject?: string;
  roles: Role[];
  jurisdictionId?: string;
}

export interface EnrollDeviceInput {
  assignedUserId: string;
  label?: string;
  /**
   * The device's public key, base64. The private half is generated on the
   * device and held in its Keystore; it never leaves, and the server never
   * asks for it. Enrollment registers only the half that verifies signatures.
   */
  publicKeyBase64: string;
  jurisdictionId?: string;
}

@Injectable()
export class AdminService {
  constructor(private readonly pg: PgService) {}

  // ---- users and roles ----------------------------------------------------

  async listUsers(principal: Principal) {
    return this.pg.query(
      `SELECT u.id, u.full_name, u.email, u.phone, u.status, u.jurisdiction_id,
              u.created_at,
              coalesce(array_agg(ur.role_code) FILTER (WHERE ur.role_code IS NOT NULL),
                       ARRAY[]::text[]) AS roles
       FROM app_user u
       LEFT JOIN user_role ur ON ur.user_id = u.id
       WHERE ($1::uuid IS NULL OR u.jurisdiction_id = $1)
       GROUP BY u.id
       ORDER BY u.full_name`,
      [jurisdictionFilter(principal)],
    );
  }

  async createUser(principal: Principal, input: CreateUserInput): Promise<string> {
    const jurisdictionId = this.targetJurisdiction(principal, input.jurisdictionId);

    return this.pg.transaction(async (client) => {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO app_user (jurisdiction_id, full_name, email, phone, oidc_subject)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [
          jurisdictionId,
          input.fullName,
          input.email ?? null,
          input.phone ?? null,
          input.oidcSubject ?? null,
        ],
      );
      const userId = inserted.rows[0]!.id;

      for (const role of input.roles) {
        await client.query(
          `INSERT INTO user_role (user_id, role_code, jurisdiction_id)
           VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [userId, role, jurisdictionId],
        );
      }
      return userId;
    });
  }

  async grantRole(principal: Principal, userId: string, role: Role): Promise<void> {
    const jurisdictionId = await this.userJurisdiction(principal, userId);
    await this.pg.query(
      `INSERT INTO user_role (user_id, role_code, jurisdiction_id)
       VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [userId, role, jurisdictionId],
    );
  }

  async revokeRole(principal: Principal, userId: string, role: Role): Promise<void> {
    const jurisdictionId = await this.userJurisdiction(principal, userId);
    await this.pg.query(
      `DELETE FROM user_role
        WHERE user_id = $1 AND role_code = $2
          AND (jurisdiction_id IS NOT DISTINCT FROM $3)`,
      [userId, role, jurisdictionId],
    );
  }

  async suspendUser(principal: Principal, userId: string): Promise<void> {
    await this.userJurisdiction(principal, userId);
    await this.pg.query(`UPDATE app_user SET status = 'suspended' WHERE id = $1`, [userId]);
  }

  // ---- devices ------------------------------------------------------------

  async listDevices(principal: Principal) {
    return this.pg.query(
      `SELECT d.id, d.label, d.status, d.enrolled_at, d.revoked_at, d.jurisdiction_id,
              d.assigned_user_id, u.full_name AS assigned_to,
              encode(d.public_key, 'base64') AS public_key,
              (SELECT count(*) FROM event_store e WHERE e.device_id = d.id)::int AS events_authored
       FROM device d
       LEFT JOIN app_user u ON u.id = d.assigned_user_id
       WHERE ($1::uuid IS NULL OR d.jurisdiction_id = $1)
       ORDER BY d.enrolled_at DESC`,
      [jurisdictionFilter(principal)],
    );
  }

  /**
   * Enroll a field device. From this point every event the device authors is
   * attributable cryptographically: the server can prove which enrolled device
   * wrote it, and the device cannot repudiate it or forge another's.
   */
  async enrollDevice(principal: Principal, input: EnrollDeviceInput): Promise<string> {
    const jurisdictionId = this.targetJurisdiction(principal, input.jurisdictionId);
    const publicKey = this.parsePublicKey(input.publicKeyBase64);

    const assignee = await this.pg.query<{ jurisdiction_id: string | null }>(
      `SELECT jurisdiction_id FROM app_user WHERE id = $1 AND status = 'active'`,
      [input.assignedUserId],
    );
    if (assignee.length === 0) throw new NotFoundException("active user to assign the device to");
    if (!isUnscoped(principal) && assignee[0]!.jurisdiction_id !== jurisdictionId) {
      throw new ForbiddenException("the assigned user is in another jurisdiction");
    }

    // Two devices sharing a key would make their events indistinguishable, and
    // attribution is the point of enrolling them at all.
    const existing = await this.pg.query(
      `SELECT 1 FROM device WHERE public_key = $1`,
      [Buffer.from(publicKey)],
    );
    if (existing.length > 0) {
      throw new ConflictException("this public key is already enrolled to a device");
    }

    const rows = await this.pg.query<{ id: string }>(
      `INSERT INTO device (jurisdiction_id, assigned_user_id, public_key, label)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [jurisdictionId, input.assignedUserId, Buffer.from(publicKey), input.label ?? null],
    );
    return rows[0]!.id;
  }

  /**
   * A device asking to be enrolled, for itself.
   *
   * The inspector signs in, the handset submits the public half of the key it
   * generated, and an administrator approves it from the console. That is the
   * same gate as enrollDevice — nothing can author an event until a person
   * approves it, because ingest refuses any device that is not active — but it
   * removes the step where someone carries a public key between two machines by
   * hand, which is the step that was actually going wrong.
   *
   * Requesting is idempotent by key. A handset that asks twice, or reinstalls
   * and asks again with the key still in its keystore, gets the same device
   * back rather than a second row or a conflict.
   */
  async requestEnrolment(
    principal: Principal,
    input: { publicKeyBase64: string; label?: string },
  ): Promise<{ deviceId: string; status: string }> {
    const publicKey = this.parsePublicKey(input.publicKeyBase64);

    const existing = await this.pg.query<{ id: string; status: string; assigned_user_id: string }>(
      `SELECT id, status, assigned_user_id FROM device WHERE public_key = $1`,
      [Buffer.from(publicKey)],
    );
    if (existing.length > 0) {
      const device = existing[0]!;
      // Someone else's key. Handing it back would tell this caller a device id
      // they have no claim to, and re-pointing it at them would let anyone
      // capture an enrolled handset by guessing its key.
      if (device.assigned_user_id !== principal.userId) {
        throw new ConflictException("this key is already enrolled to another user");
      }
      return { deviceId: device.id, status: device.status };
    }

    const [user] = await this.pg.query<{ jurisdiction_id: string | null }>(
      `SELECT jurisdiction_id FROM app_user WHERE id = $1 AND status = 'active'`,
      [principal.userId],
    );
    if (!user) throw new ForbiddenException("your account is not active");

    const rows = await this.pg.query<{ id: string }>(
      `INSERT INTO device (jurisdiction_id, assigned_user_id, public_key, label, status)
       VALUES ($1,$2,$3,$4,'pending') RETURNING id`,
      [user.jurisdiction_id, principal.userId, Buffer.from(publicKey), input.label ?? null],
    );
    return { deviceId: rows[0]!.id, status: "pending" };
  }

  /** Approve a device that asked to be enrolled. */
  async approveDevice(principal: Principal, deviceId: string): Promise<void> {
    const rows = await this.pg.query<{ id: string }>(
      `UPDATE device SET status = 'active', enrolled_at = now()
        WHERE id = $1 AND status = 'pending'
          AND ($2::uuid IS NULL OR jurisdiction_id = $2)
       RETURNING id`,
      [deviceId, jurisdictionFilter(principal)],
    );
    if (rows.length === 0) throw new NotFoundException("device awaiting approval");
  }

  /** What this device is allowed to do, as the device itself sees it. */
  async deviceStatus(principal: Principal, publicKeyBase64: string) {
    const publicKey = this.parsePublicKey(publicKeyBase64);
    const [device] = await this.pg.query<{ id: string; status: string }>(
      `SELECT id, status FROM device WHERE public_key = $1 AND assigned_user_id = $2`,
      [Buffer.from(publicKey), principal.userId],
    );
    return device ? { deviceId: device.id, status: device.status } : { deviceId: null, status: "none" };
  }

  /**
   * Revoke a lost or stolen device. Events it already authored stay valid and
   * stay attributed — they were signed by a key the regulator trusted at the
   * time, and rewriting that would be exactly the tampering the chain prevents.
   * What stops is the acceptance of anything new under that key.
   */
  async revokeDevice(principal: Principal, deviceId: string, reason: string): Promise<void> {
    const rows = await this.pg.query<{ id: string }>(
      `UPDATE device SET status = 'revoked', revoked_at = now()
        WHERE id = $1 AND status = 'active'
          AND ($2::uuid IS NULL OR jurisdiction_id = $2)
       RETURNING id`,
      [deviceId, jurisdictionFilter(principal)],
    );
    if (rows.length === 0) throw new NotFoundException("active device");

    await this.pg.query(
      `INSERT INTO notification (user_id, kind, payload)
       SELECT $1, 'device_revoked', $2::jsonb`,
      [principal.userId, JSON.stringify({ deviceId, reason, by: principal.userId })],
    );
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

  /** Where this actor is allowed to create things. */
  private targetJurisdiction(principal: Principal, requested?: string): string {
    if (isUnscoped(principal)) {
      if (!requested) {
        throw new BadRequestException("jurisdictionId is required for a national role");
      }
      return requested;
    }
    if (!principal.jurisdictionId) {
      throw new ForbiddenException("your account has no jurisdiction");
    }
    if (requested && requested !== principal.jurisdictionId) {
      throw new ForbiddenException("you may only administer your own jurisdiction");
    }
    return principal.jurisdictionId;
  }

  private async userJurisdiction(principal: Principal, userId: string): Promise<string | null> {
    const rows = await this.pg.query<{ jurisdiction_id: string | null }>(
      `SELECT jurisdiction_id FROM app_user WHERE id = $1`,
      [userId],
    );
    if (rows.length === 0) throw new NotFoundException("user");
    const jurisdictionId = rows[0]!.jurisdiction_id;
    if (!isUnscoped(principal) && jurisdictionId !== principal.jurisdictionId) {
      throw new ForbiddenException("that user is in another jurisdiction");
    }
    return jurisdictionId;
  }
}
