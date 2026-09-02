import { describe, it, expect } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { AuditService, PROCESSING_ACTIVITIES } from "../src/console/audit.service";
import type { Principal } from "../src/common/principal";

// The NDPA exports. Two things have to hold, and neither is about formatting.
//
// A subject access request reaches personal data across the whole platform, so
// the export is the widest read in the system; it must not be reachable by an
// ordinary inspector, and it must stay inside the caller's jurisdiction. And the
// Record of Processing Activities has to describe this platform truthfully — in
// particular that nothing leaves Nigeria and that nothing runs on consent, since
// an inspection is a statutory act and a facility cannot withdraw from it.

const KATSINA = "018f0000-0000-7000-8000-000000000001";
const OTHER_STATE = "018f0000-0000-7000-8000-000000000002";
const SUBJECT = "018f0000-0000-7000-8000-00000000aaaa";

class FakePg {
  seen: Array<{ text: string; params: unknown[] }> = [];
  constructor(private readonly subjectJurisdiction: string | null = KATSINA) {}

  async query<T>(text: string, params: unknown[] = []): Promise<T[]> {
    this.seen.push({ text, params });

    if (text.includes("FROM app_user WHERE id = $1")) {
      // The query scopes itself: $2 is the caller's jurisdiction filter, and a
      // subject outside it comes back as no row at all.
      const filter = params[1] as string | null;
      if (filter !== null && filter !== this.subjectJurisdiction) return [] as T[];
      return [{ id: SUBJECT, full_name: "Aisha Bello" }] as T[];
    }
    if (text.includes("SELECT\n")) {
      return [
        { users: "12", devices: "9", inspections: "40", evidence_objects: "88", events: "512" },
      ] as T[];
    }
    return [] as T[];
  }
}

function principal(roles: Principal["roles"], jurisdictionId: string | null): Principal {
  return { userId: "018f0000-0000-7000-8000-0000000000ad", deviceId: null, jurisdictionId, roles };
}

function service(pg: FakePg): AuditService {
  return new AuditService(pg as never);
}

describe("subject access export", () => {
  it("is refused to an inspector", async () => {
    await expect(
      service(new FakePg()).subjectAccessExport(principal(["inspector"], KATSINA), SUBJECT),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("is refused for a subject in another state", async () => {
    await expect(
      service(new FakePg()).subjectAccessExport(principal(["state_admin"], OTHER_STATE), SUBJECT),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("reaches the event store, not only the projections", async () => {
    const pg = new FakePg();
    const result = await service(pg).subjectAccessExport(
      principal(["state_admin"], KATSINA),
      SUBJECT,
    );

    expect(result.subject).toMatchObject({ id: SUBJECT });
    expect(result).toHaveProperty("eventsAuthored");
    // An event whose projection has been rebuilt away is still personal data the
    // platform holds, so the export has to read the store itself.
    expect(pg.seen.some((q) => q.text.includes("FROM event_store"))).toBe(true);
  });

  it("lets an auditor cross jurisdictions, because that is the role's point", async () => {
    const pg = new FakePg(OTHER_STATE);
    await expect(
      service(pg).subjectAccessExport(principal(["auditor"], KATSINA), SUBJECT),
    ).resolves.toMatchObject({ subject: { id: SUBJECT } });
  });
});

describe("record of processing activities", () => {
  it("states residency and claims no transfer abroad", async () => {
    const record = await service(new FakePg()).recordOfProcessing(
      principal(["state_admin"], KATSINA),
    );
    expect(record.residency).toBe("Nigeria");
    expect(record.transfersOutsideNigeria).toBe("None.");
    expect(record.volumes.events).toBe(512);
  });

  it("never rests an activity on consent", () => {
    // Consent that cannot be refused is not consent. Every activity here is a
    // statutory one, and saying otherwise in the ROPA would be a false
    // representation to the regulator, not a wording preference.
    for (const activity of PROCESSING_ACTIVITIES) {
      expect(activity.lawfulBasis.toLowerCase()).not.toContain("consent");
      expect(activity.residency).toBe("Nigeria");
    }
  });

  it("says on the public-verification entry that no adverse data is reachable", () => {
    const publicEntry = PROCESSING_ACTIVITIES.find((a) => a.activity === "Public verification");
    expect(publicEntry?.categories).toContain("No adverse data");
  });
});
