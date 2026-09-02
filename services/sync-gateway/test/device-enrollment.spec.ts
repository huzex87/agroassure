import { describe, it, expect } from "vitest";
import { bytesToBase64, derivePublicKey } from "@agroassure/domain";
import { AdminService } from "../src/console/admin.service";
import type { Principal } from "../src/common/principal";

// Enrollment is what turns field attribution from a claim into something the
// server can prove. A device that got enrolled with a key that is not a key
// would produce events nobody can verify, so the key is checked here rather
// than discovered later at ingest, when the inspection is already over.

const JURISDICTION = "018f0000-0000-7000-8000-0000000000jx".replace("jx", "01");
const USER = "018f0000-0000-7000-8000-000000000001";

const VALID_KEY = bytesToBase64(
  derivePublicKey(
    (() => {
      const k = new Uint8Array(32);
      for (let i = 0; i < 32; i++) k[i] = (i * 5 + 2) & 0xff;
      return k;
    })(),
  ),
);

class FakePg {
  inserted: unknown[][] = [];
  constructor(private readonly keyAlreadyEnrolled = false) {}
  async query<T>(text: string, params: unknown[] = []): Promise<T[]> {
    if (text.includes("FROM app_user WHERE id = $1 AND status = 'active'")) {
      return [{ jurisdiction_id: JURISDICTION }] as T[];
    }
    if (text.includes("FROM device WHERE public_key = $1")) {
      return (this.keyAlreadyEnrolled ? [{ one: 1 }] : []) as T[];
    }
    if (text.includes("INSERT INTO device")) {
      this.inserted.push(params);
      return [{ id: "018f0000-0000-7000-8000-0000000000dd" }] as T[];
    }
    return [] as T[];
  }
}

function stateAdmin(): Principal {
  return {
    userId: "018f0000-0000-7000-8000-0000000000ad",
    deviceId: null,
    jurisdictionId: JURISDICTION,
    roles: ["state_admin"],
  };
}

function service(keyAlreadyEnrolled = false) {
  const pg = new FakePg(keyAlreadyEnrolled);
  return { pg, admin: new AdminService(pg as never) };
}

describe("AdminService.enrollDevice", () => {
  it("registers a valid ed25519 public key against the assigned inspector", async () => {
    const { admin, pg } = service();
    const id = await admin.enrollDevice(stateAdmin(), {
      assignedUserId: USER,
      label: "field tablet",
      publicKeyBase64: VALID_KEY,
    });

    expect(id).toBeTruthy();
    const [jurisdiction, assignee, key] = pg.inserted[0]!;
    expect(jurisdiction).toBe(JURISDICTION);
    expect(assignee).toBe(USER);
    // Stored as the 32 raw bytes the signature check needs.
    expect((key as Buffer).length).toBe(32);
  });

  it("refuses a key of the wrong length", async () => {
    const { admin, pg } = service();
    await expect(
      admin.enrollDevice(stateAdmin(), {
        assignedUserId: USER,
        publicKeyBase64: bytesToBase64(new Uint8Array(16)),
      }),
    ).rejects.toThrow(/32 bytes; got 16/);
    expect(pg.inserted).toHaveLength(0);
  });

  it("refuses something that is not base64 at all", async () => {
    const { admin, pg } = service();
    await expect(
      admin.enrollDevice(stateAdmin(), {
        assignedUserId: USER,
        publicKeyBase64: "not a key",
      }),
    ).rejects.toThrow();
    expect(pg.inserted).toHaveLength(0);
  });

  it("refuses a key already enrolled to another device", async () => {
    // Two devices sharing a key would make their events indistinguishable,
    // and telling them apart is the whole point of enrolling one.
    const { admin, pg } = service(true);
    await expect(
      admin.enrollDevice(stateAdmin(), {
        assignedUserId: USER,
        publicKeyBase64: VALID_KEY,
      }),
    ).rejects.toThrow(/already enrolled/);
    expect(pg.inserted).toHaveLength(0);
  });

  it("refuses to enroll into another jurisdiction", async () => {
    const { admin, pg } = service();
    await expect(
      admin.enrollDevice(stateAdmin(), {
        assignedUserId: USER,
        publicKeyBase64: VALID_KEY,
        jurisdictionId: "018f0000-0000-7000-8000-0000000000ff",
      }),
    ).rejects.toThrow(/only administer your own jurisdiction/);
    expect(pg.inserted).toHaveLength(0);
  });

  it("requires a national administrator to name the jurisdiction", async () => {
    const { admin } = service();
    const national: Principal = {
      userId: "018f0000-0000-7000-8000-0000000000na",
      deviceId: null,
      jurisdictionId: null,
      roles: ["national_admin"],
    };
    await expect(
      admin.enrollDevice(national, { assignedUserId: USER, publicKeyBase64: VALID_KEY }),
    ).rejects.toThrow(/jurisdictionId is required/);
  });
});
