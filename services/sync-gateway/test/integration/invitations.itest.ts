import { describe, it, expect, beforeAll } from "vitest";
import { bytesToBase64, derivePublicKey } from "@agroassure/domain";
import type { AppConfig, InviteConfig } from "../../src/config/config";
import { PgService } from "../../src/db/pg.service";
import { UserDirectory } from "../../src/common/user-directory";
import { AdminService } from "../../src/console/admin.service";
import { InvitationsService } from "../../src/invitations/invitations.service";
import { InviteDelivery } from "../../src/invitations/delivery";
import { verifyDeviceSession } from "../../src/invitations/device-session";
import type { Principal } from "../../src/common/principal";

// An inspector's first day, as the database sees it: invited from the console,
// a code spent on a phone, the phone recognised on every request after — and
// then lost, signed out, and refused on the very next request.
//
// The unit suite covers the rules against a fake. What only a real database can
// check is the SQL: the partial index that keeps one live code per person, the
// guard's query that joins phone, person and role, and the team listing the
// console reads.

const DATABASE_URL = process.env.DATABASE_URL;
const ALLOWED = process.env.ALLOW_DESTRUCTIVE_TEST_DB === "1";
const runIf = DATABASE_URL && ALLOWED ? describe : describe.skip;

const SECRET = "integration-device-session-secret-32+chars";

function key(seed: number): string {
  const k = new Uint8Array(32);
  for (let i = 0; i < 32; i++) k[i] = (i * seed + 11) & 0xff;
  return bytesToBase64(derivePublicKey(k));
}

runIf("inviting an inspector, end to end", () => {
  let pg: PgService;
  let invitations: InvitationsService;
  let directory: UserDirectory;
  let admin: AdminService;
  let administrator: Principal;

  beforeAll(async () => {
    const invites: InviteConfig = {
      deviceTokenSecret: SECRET,
      ttlHours: 72,
      appDownloadUrl: null,
      // Nothing leaves the building: both channels report "not set up".
      email: { provider: "none", apiKey: null, from: null },
      sms: {
        provider: "none",
        apiKey: null,
        senderId: null,
        account: null,
        channel: "dnd",
        defaultCountryCode: "234",
      },
    };
    const config = { databaseUrl: DATABASE_URL, invites } as AppConfig;
    pg = new PgService(config);
    invitations = new InvitationsService(pg, new InviteDelivery(config), config);
    directory = new UserDirectory(pg);
    admin = new AdminService(pg);

    const code = `I${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    const jurisdictionId = (
      await pg.query<{ id: string }>(
        `INSERT INTO jurisdiction (name, code) VALUES ($1, $2) RETURNING id`,
        [`Invitations ${code}`, code],
      )
    )[0]!.id;
    const adminId = (
      await pg.query<{ id: string }>(
        `INSERT INTO app_user (jurisdiction_id, full_name) VALUES ($1, 'Invite Admin') RETURNING id`,
        [jurisdictionId],
      )
    )[0]!.id;
    administrator = { userId: adminId, deviceId: null, jurisdictionId, roles: ["state_admin"] };
  });

  let userId: string;
  let firstCode: string;
  let deviceId: string;
  let token: string;

  it("adds the inspector and issues a code, recording that nothing was sent", async () => {
    const issued = await invitations.invite(administrator, {
      fullName: "Aisha Bello",
      phone: "0803 123 4567",
      email: `aisha.${Date.now()}@example.org`,
    });
    userId = issued.userId;
    firstCode = issued.code;

    expect(issued.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(issued.qrSvg).toContain("<svg");
    expect(issued.sms).toMatchObject({ to: "+2348031234567", status: "skipped" });
    expect(issued.email.status).toBe("skipped");

    const [row] = await pg.query<{ phone: string; roles: string[] }>(
      `SELECT u.phone, array_agg(r.role_code) AS roles
         FROM app_user u JOIN user_role r ON r.user_id = u.id
        WHERE u.id = $1 GROUP BY u.phone`,
      [userId],
    );
    expect(row).toEqual({ phone: "+2348031234567", roles: ["inspector"] });

    // The code itself is nowhere in the database.
    const stored = await pg.query(`SELECT 1 FROM invitation WHERE code_hash LIKE $1`, [
      `%${firstCode.replace("-", "")}%`,
    ]);
    expect(stored).toHaveLength(0);
  });

  it("keeps one live code per person: a new one retires the old", async () => {
    const second = await invitations.reinvite(administrator, userId);
    await expect(
      invitations.activate({ code: firstCode, publicKeyBase64: key(3) }),
    ).rejects.toMatchObject({ response: { reason: "invalid_code" } });
    firstCode = second.code;

    const live = await pg.query(
      `SELECT 1 FROM invitation WHERE user_id = $1 AND used_at IS NULL AND cancelled_at IS NULL`,
      [userId],
    );
    expect(live).toHaveLength(1);
  });

  it("shows the waiting invite on the team listing", async () => {
    const users = await admin.listUsers(administrator);
    const aisha = users.find((u: { id: string }) => u.id === userId) as Record<string, unknown>;
    expect(aisha.active_phones).toBe(0);
    expect(aisha.invitation_id).toBeTruthy();
    expect(aisha.invitation_sms_status).toBe("skipped");
  });

  it("activates a phone with the code, active at once", async () => {
    const result = await invitations.activate({
      code: firstCode.toLowerCase(),
      publicKeyBase64: key(3),
      label: "Tecno Spark 20",
    });
    deviceId = result.deviceId;
    token = result.token;

    expect(verifyDeviceSession(token, SECRET)).toMatchObject({ sub: userId, device_id: deviceId });
    const [device] = await pg.query<{ status: string; label: string }>(
      `SELECT status, label FROM device WHERE id = $1`,
      [deviceId],
    );
    expect(device).toEqual({ status: "active", label: "Tecno Spark 20" });

    await expect(
      invitations.activate({ code: firstCode, publicKeyBase64: key(5) }),
    ).rejects.toMatchObject({ response: { reason: "already_used" } });
  });

  it("recognises the phone on every request, as an inspector in the right state", async () => {
    const resolved = await directory.resolvePhone(userId, deviceId);
    expect(resolved).toEqual({ id: userId, jurisdictionId: administrator.jurisdictionId });

    const users = await admin.listUsers(administrator);
    const aisha = users.find((u: { id: string }) => u.id === userId) as Record<string, unknown>;
    expect(aisha.active_phones).toBe(1);
    expect(aisha.phone_last_seen_at).toBeTruthy();
    expect(aisha.invitation_id).toBeNull();
  });

  it("refuses the phone on the next request once it is signed out remotely", async () => {
    await admin.revokeDevice(administrator, deviceId, "lost on the road to Daura");
    expect(await directory.resolvePhone(userId, deviceId)).toBeNull();

    // And the same key cannot be brought back with a new code.
    const fresh = await invitations.reinvite(administrator, userId);
    await expect(
      invitations.activate({ code: fresh.code, publicKeyBase64: key(3) }),
    ).rejects.toMatchObject({ response: { reason: "device_signed_out" } });

    // A new key — which is what the app makes — is a new, separate phone.
    const replacement = await invitations.activate({ code: fresh.code, publicKeyBase64: key(7) });
    expect(replacement.deviceId).not.toBe(deviceId);
    expect(await directory.resolvePhone(userId, replacement.deviceId)).not.toBeNull();
  });

  it("stops a phone working when its inspector loses the inspector role", async () => {
    const issued = await invitations.invite(administrator, {
      fullName: "Musa Danjuma",
      phone: "0806 555 0101",
    });
    const phone = await invitations.activate({ code: issued.code, publicKeyBase64: key(9) });
    expect(await directory.resolvePhone(issued.userId, phone.deviceId)).not.toBeNull();

    await admin.revokeRole(administrator, issued.userId, "inspector");
    expect(await directory.resolvePhone(issued.userId, phone.deviceId)).toBeNull();
  });
});
