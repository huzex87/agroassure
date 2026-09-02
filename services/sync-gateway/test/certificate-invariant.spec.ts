import { describe, it, expect, beforeEach } from "vitest";
import { CertificatesService } from "../src/console/certificates.service";
import type { Principal } from "../src/common/principal";

// The invariant the guide singles out: a certificate cannot exist without a
// recorded officer decision and a named authorising officer. The schema refuses
// such a row, and these tests hold the other half of the guarantee, that the
// only command able to mint one refuses every path that would try.
//
// Each test asserts the negative too: nothing was appended. A refusal that still
// wrote an event would be worse than no refusal at all.

const OFFICER = "018f0000-0000-7000-8000-00000000000f";
const OTHER_OFFICER = "018f0000-0000-7000-8000-0000000000ff";
const INSPECTION = "018f0000-0000-7000-8000-000000000001";

interface Row {
  decision_id: string | null;
  officer_id: string | null;
  facility_id: string;
  jurisdiction_id: string;
  jurisdiction_code: string;
  licence_number: string;
  rating_band: string | null;
  open_findings: string;
}

function row(over: Partial<Row> = {}): Row {
  return {
    decision_id: "018f0000-0000-7000-8000-0000000000de",
    officer_id: OFFICER,
    facility_id: "018f0000-0000-7000-8000-0000000000fa",
    jurisdiction_id: "018f0000-0000-7000-8000-0000000000jx".replace("jx", "01"),
    jurisdiction_code: "KT",
    licence_number: "FISS/KT/AD/2026/0417",
    rating_band: "satisfactory",
    open_findings: "0",
    ...over,
  };
}

// A pg stand-in that answers the two queries the command makes: the inspection
// lookup, and the "is this serial taken" / "already certified" checks.
class FakePg {
  constructor(
    private readonly inspectionRow: Row | null,
    private readonly existingCertificate = false,
  ) {}

  async query<T>(text: string): Promise<T[]> {
    if (text.includes("FROM inspection i")) {
      return (this.inspectionRow ? [this.inspectionRow] : []) as T[];
    }
    if (text.includes("WHERE inspection_id = $1 AND status = 'valid'")) {
      return (this.existingCertificate ? [{ one: 1 }] : []) as T[];
    }
    if (text.includes("WHERE serial = $1")) {
      return [] as T[]; // no serial collisions in these tests
    }
    return [] as T[];
  }
}

class FakeAppender {
  appended: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
  async append(req: { eventType: string; payload: unknown }): Promise<string> {
    this.appended.push({
      eventType: req.eventType,
      payload: req.payload as Record<string, unknown>,
    });
    return "event-id";
  }
}

function principal(userId = OFFICER): Principal {
  return {
    userId,
    deviceId: null,
    jurisdictionId: row().jurisdiction_id,
    roles: ["authorising_officer"],
  };
}

function service(inspectionRow: Row | null, existingCertificate = false) {
  const appender = new FakeAppender();
  const svc = new CertificatesService(
    new FakePg(inspectionRow, existingCertificate) as never,
    appender as never,
  );
  return { svc, appender };
}

describe("CertificatesService.authorise (the certificate invariant)", () => {
  let subject: ReturnType<typeof service>;

  beforeEach(() => {
    subject = service(row());
  });

  it("refuses when no authorising decision is on record", async () => {
    const { svc, appender } = service(row({ decision_id: null, officer_id: null }));
    await expect(svc.authorise(principal(), INSPECTION)).rejects.toThrow(
      /no authorising decision/i,
    );
    expect(appender.appended).toHaveLength(0);
  });

  it("refuses an officer who is not the one who made the decision", async () => {
    const { svc, appender } = service(row({ officer_id: OTHER_OFFICER }));
    await expect(svc.authorise(principal(OFFICER), INSPECTION)).rejects.toThrow(
      /only the deciding officer/i,
    );
    expect(appender.appended).toHaveLength(0);
  });

  it("refuses while any finding remains open", async () => {
    const { svc, appender } = service(row({ open_findings: "2" }));
    await expect(svc.authorise(principal(), INSPECTION)).rejects.toThrow(/2 finding/i);
    expect(appender.appended).toHaveLength(0);
  });

  it("refuses a rating that does not support issuance", async () => {
    for (const band of ["needs_improvement", "critical_issues", null]) {
      const { svc, appender } = service(row({ rating_band: band }));
      await expect(svc.authorise(principal(), INSPECTION)).rejects.toThrow(
        /does not support issuance/i,
      );
      expect(appender.appended).toHaveLength(0);
    }
  });

  it("refuses a second certificate for an inspection that already has one", async () => {
    const { svc, appender } = service(row(), true);
    await expect(svc.authorise(principal(), INSPECTION)).rejects.toThrow(/already exists/i);
    expect(appender.appended).toHaveLength(0);
  });

  it("refuses an inspection outside the officer's jurisdiction", async () => {
    const { svc, appender } = service(row({ jurisdiction_id: "some-other-jurisdiction" }));
    await expect(svc.authorise(principal(), INSPECTION)).rejects.toThrow(/jurisdiction/i);
    expect(appender.appended).toHaveLength(0);
  });

  it("refuses an inspection that does not exist or is not submitted", async () => {
    const { svc, appender } = service(null);
    await expect(svc.authorise(principal(), INSPECTION)).rejects.toThrow();
    expect(appender.appended).toHaveLength(0);
  });

  it("authorises, naming the officer and the decision it descends from", async () => {
    const { svc, appender } = subject;
    const result = await svc.authorise(principal(), INSPECTION);

    expect(appender.appended).toHaveLength(1);
    const event = appender.appended[0]!;
    expect(event.eventType).toBe("CertificateAuthorised");
    expect(event.payload.authorisingOfficerId).toBe(OFFICER);
    expect(event.payload.decisionId).toBe(row().decision_id);
    expect(event.payload.inspectionId).toBe(INSPECTION);
    expect(result.serial).toMatch(/^AA-KT-0417-\d{4}$/);
    // The QR token is separate from the printed serial and carries the entropy.
    expect(String(event.payload.verificationToken)).not.toBe(result.serial);
    expect(String(event.payload.verificationToken).length).toBeGreaterThan(20);
  });

  it("dates validity forward and the next inspection before it", async () => {
    const { svc, appender } = subject;
    await svc.authorise(principal(), INSPECTION);
    const p = appender.appended[0]!.payload as Record<string, string>;
    expect(new Date(p.validTo!).getTime()).toBeGreaterThan(new Date(p.issuedOn!).getTime());
    expect(new Date(p.nextDueOn!).getTime()).toBeGreaterThan(new Date(p.issuedOn!).getTime());
    expect(new Date(p.nextDueOn!).getTime()).toBeLessThan(new Date(p.validTo!).getTime());
  });
});
