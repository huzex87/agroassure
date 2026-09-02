import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  FieldInspection,
  FieldStore,
  EventAuthor,
  applyBootstrap,
  toDeviceEvent,
  type InstrumentStructure,
} from "@agroassure/field-core";
import { derivePublicKey, hexToBytes, signEventHash, uuidv7 } from "@agroassure/domain";
import type { AppConfig } from "../../src/config/config";
import { PgService } from "../../src/db/pg.service";
import { ProjectorService } from "../../src/projections/projector.service";
import { EventAppender } from "../../src/events/event-appender.service";
import { IngestService } from "../../src/sync/ingest.service";
import { PgEventStore } from "../../src/sync/pg-event-store";
import { RegistryService } from "../../src/console/registry.service";
import { InspectionsService } from "../../src/console/inspections.service";
import { FindingsService } from "../../src/console/findings.service";
import { CertificatesService } from "../../src/console/certificates.service";
import type { Principal } from "../../src/common/principal";
import { nodeSqliteStore } from "./sqlite-driver";

// One inspection, from an inspector's offline device to a certificate a buyer
// can verify, through the real ingest path and a real PostgreSQL.
//
// The unit suites test each piece against fakes. This one is here because the
// parts that fakes cannot check are the parts most likely to be wrong: the
// projector's SQL, the joins that resolve a checkpoint's weight, and whether the
// number a device computes offline survives the trip to the public page.

const DATABASE_URL = process.env.DATABASE_URL;
const ALLOWED = process.env.ALLOW_DESTRUCTIVE_TEST_DB === "1";

// This suite writes events that cannot be deleted afterwards (the store is
// append-only, by design) and rebuilds every projection, which drops rows. It
// therefore refuses to run against any database not explicitly marked
// disposable. CI points it at a throwaway container.
const runIf = DATABASE_URL && ALLOWED ? describe : describe.skip;

const DEVICE_PRIVATE_KEY = (() => {
  const k = new Uint8Array(32);
  for (let i = 0; i < 32; i++) k[i] = (i * 13 + 7) & 0xff;
  return k;
})();
const DEVICE_PUBLIC_KEY = derivePublicKey(DEVICE_PRIVATE_KEY);

/** 9 sections, 41 checkpoints; section 7 is the equipment that may be absent. */
function agroDealerStructure(): InstrumentStructure {
  const sections: InstrumentStructure["sections"] = [];
  let remaining = 41;
  for (let s = 1; s <= 9; s++) {
    const count = s === 9 ? remaining : Math.min(5, remaining);
    remaining -= count;
    sections.push({
      ordinal: s,
      titleEn: `Section ${s}`,
      titleHa: `Sashe ${s}`,
      checkpoints: Array.from({ length: count }, (_, i) => ({
        ordinal: i + 1,
        promptEn: `Checkpoint ${s}.${i + 1}`,
        promptHa: `Bincike ${s}.${i + 1}`,
        weight: 1,
        severityOnFail: "minor" as const,
        allowsNa: s === 7,
      })),
    });
  }
  return { sections };
}

runIf("an inspection, from an offline device to the public page", () => {
  const structure = agroDealerStructure();
  const structureHashHex = "b7c9aa1100000000";

  let pg: PgService;
  let projector: ProjectorService;
  let appender: EventAppender;
  let ingest: IngestService;
  let registry: RegistryService;
  let inspections: InspectionsService;
  let findings: FindingsService;
  let certificates: CertificatesService;

  let jurisdictionId: string;
  let inspectorId: string;
  let officerId: string;
  let deviceId: string;
  let versionId: string;
  let facilityId: string;
  let inspectionId: string;

  let inspector: Principal;
  let officer: Principal;

  beforeAll(async () => {
    pg = new PgService({ databaseUrl: DATABASE_URL } as AppConfig);
    projector = new ProjectorService(pg);
    appender = new EventAppender(pg, projector);
    ingest = new IngestService(new PgEventStore(pg));
    registry = new RegistryService(pg, appender);
    inspections = new InspectionsService(pg, appender);
    findings = new FindingsService(pg, appender);
    certificates = new CertificatesService(pg, appender);

    // ---- the jurisdiction, its people, and its instrument ------------------
    const code = `T${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    jurisdictionId = (
      await pg.query<{ id: string }>(
        `INSERT INTO jurisdiction (name, code) VALUES ($1, $2) RETURNING id`,
        [`Integration ${code}`, code],
      )
    )[0]!.id;

    await pg.query(
      `INSERT INTO issuing_authority (jurisdiction_id, display_name, legal_name)
       VALUES ($1, 'Mandated regulator', 'Farm Input Support Services')`,
      [jurisdictionId],
    );

    inspectorId = (
      await pg.query<{ id: string }>(
        `INSERT INTO app_user (jurisdiction_id, full_name) VALUES ($1, 'Musa Danladi') RETURNING id`,
        [jurisdictionId],
      )
    )[0]!.id;
    officerId = (
      await pg.query<{ id: string }>(
        `INSERT INTO app_user (jurisdiction_id, full_name) VALUES ($1, 'Hauwa Ibrahim') RETURNING id`,
        [jurisdictionId],
      )
    )[0]!.id;

    deviceId = (
      await pg.query<{ id: string }>(
        `INSERT INTO device (jurisdiction_id, assigned_user_id, public_key, label)
         VALUES ($1, $2, $3, 'field tablet') RETURNING id`,
        [jurisdictionId, inspectorId, Buffer.from(DEVICE_PUBLIC_KEY)],
      )
    )[0]!.id;

    const instrumentId = (
      await pg.query<{ id: string }>(
        `INSERT INTO instrument (jurisdiction_id, facility_type, name)
         VALUES ($1, 'agro_dealer', 'Agro-Dealer Warehouse Inspection') RETURNING id`,
        [jurisdictionId],
      )
    )[0]!.id;

    versionId = (
      await pg.query<{ id: string }>(
        `INSERT INTO instrument_version
           (instrument_id, version_label, status, effective_from, structure_hash)
         VALUES ($1, 'v3.1', 'in_force', current_date, decode($2,'hex')) RETURNING id`,
        [instrumentId, structureHashHex],
      )
    )[0]!.id;

    // The weights the server scores with live here, not on the device.
    for (const section of structure.sections) {
      const sectionId = (
        await pg.query<{ id: string }>(
          `INSERT INTO section (instrument_version_id, ordinal, title_en, title_ha)
           VALUES ($1,$2,$3,$4) RETURNING id`,
          [versionId, section.ordinal, section.titleEn, section.titleHa],
        )
      )[0]!.id;
      for (const checkpoint of section.checkpoints) {
        await pg.query(
          `INSERT INTO checkpoint
             (section_id, ordinal, prompt_en, prompt_ha, weight, severity_on_fail, allows_na)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            sectionId,
            checkpoint.ordinal,
            checkpoint.promptEn,
            checkpoint.promptHa,
            checkpoint.weight,
            checkpoint.severityOnFail,
            checkpoint.allowsNa,
          ],
        );
      }
    }

    inspector = {
      userId: inspectorId,
      deviceId,
      jurisdictionId,
      roles: ["inspector"],
    };
    officer = {
      userId: officerId,
      deviceId: null,
      jurisdictionId,
      roles: ["desk_supervisor", "authorising_officer"],
    };

    // ---- the registry entry, written the way the console writes it ---------
    facilityId = await registry.register(officer, {
      licenceNumber: `FISS/${code}/AD/2026/0417`,
      facilityType: "agro_dealer",
      name: "Rimin Zakara Agro Ventures Ltd",
      lga: "Katsina",
      registeredPoint: { lat: 12.98547, lng: 7.61893, accuracyM: 4 },
    });
  }, 60_000);

  afterAll(async () => {
    await pg?.onModuleDestroy();
  });

  it("projects a facility registered through the console", async () => {
    const [row] = await pg.query<{ name: string; lga: string; lat: number }>(
      `SELECT name, lga, ST_Y(registered_point::geometry) AS lat
       FROM facility WHERE id = $1`,
      [facilityId],
    );
    expect(row?.name).toBe("Rimin Zakara Agro Ventures Ltd");
    expect(row?.lga).toBe("Katsina");
    expect(Number(row?.lat)).toBeCloseTo(12.98547, 5);
  });

  it("carries an offline inspection through ingest into the read models", async () => {
    // ---- the device's day, with no network -------------------------------
    const store = nodeSqliteStore();
    applyBootstrap(store, {
      facilities: [
        {
          id: facilityId,
          licenceNumber: "FISS/KT/AD/2026/0417",
          facilityType: "agro_dealer",
          name: "Rimin Zakara Agro Ventures Ltd",
          lga: "Katsina",
          regLat: 12.98547,
          regLng: 7.61893,
          regAccuracyM: 4,
        },
      ],
      instrumentVersions: [
        {
          id: versionId,
          instrumentId: uuidv7(),
          facilityType: "agro_dealer",
          versionLabel: "v3.1",
          satisfactoryMin: 80,
          needsImprovementMin: 60,
          structureHash: structureHashHex,
          structure,
        },
      ],
      priorFindings: [],
    });

    const author = new EventAuthor(
      store,
      { deviceId, sign: (hash) => signEventHash(hash, DEVICE_PRIVATE_KEY) },
      { actorUserId: inspectorId },
    );
    const session = new FieldInspection(store, author);

    const started = await session.start({
      facilityId,
      jurisdictionCode: "KT",
      at: { lat: 12.98551, lng: 7.61887, accuracyM: 5 },
    });
    inspectionId = started.inspectionId;
    expect(started.checkin.flagged).toBe(false);

    const refs = structure.sections.flatMap((s) =>
      s.checkpoints.map((c) => `${s.ordinal}.${c.ordinal}`),
    );
    const naRefs = refs.filter((r) => r.startsWith("7.")).slice(0, 4);
    const noRefs = refs.filter((r) => !naRefs.includes(r)).slice(0, 5);

    await session.captureEvidence(inspectionId, {
      checkpointRef: noRefs[0]!,
      sha256: "9c77af1000000000000000000000000000000000000000000000000000000001",
      localUri: "file:///photos/2-3.jpg",
      mime: "image/jpeg",
      capturedAt: "2026-08-18T09:26:11Z",
      at: { lat: 12.98551, lng: 7.61887, accuracyM: 5 },
    });

    for (const ref of refs) {
      if (naRefs.includes(ref)) {
        await session.recordResponse(inspectionId, { checkpointRef: ref, response: "na" });
      } else if (noRefs.includes(ref)) {
        await session.recordResponse(inspectionId, {
          checkpointRef: ref,
          response: "no",
          remark: "Two bags on the north wall show moisture damage; wall damp to touch.",
        });
      } else {
        await session.recordResponse(inspectionId, { checkpointRef: ref, response: "yes" });
      }
    }

    const onDevice = await session.submit(inspectionId, {
      inspectorUserId: inspectorId,
      inspectorSignedAt: "2026-08-18T09:39:00Z",
      facilityRep: {
        name: "Aisha Bello",
        role: "Warehouse Manager",
        signedAt: "2026-08-18T09:41:00Z",
      },
    });
    expect(onDevice.ratingPercent).toBe(86.49);

    // ---- the signal returns ----------------------------------------------
    // 1 start + 1 capture + 41 responses + 5 findings + 1 submit
    const queued = store.pendingEvents(1000);
    expect(queued).toHaveLength(49);

    const ack = await ingest.ingest(deviceId, queued.map(toDeviceEvent));
    expect(ack.acked).toHaveLength(49);
    store.markAcked(ack.acked);
    expect(store.pendingCount()).toBe(0);

    await projector.applyPending();

    // ---- what the console now sees ---------------------------------------
    const [inspection] = await pg.query<{
      rating_percent: string;
      rating_band: string;
      findings_count: number;
      status: string;
      facility_rep_name: string;
      checkin_distance_m: string;
      version_discrepancy: boolean;
    }>(`SELECT * FROM inspection WHERE id = $1`, [inspectionId]);

    expect(inspection?.status).toBe("submitted");
    // The server recomputed this from its own weights and reached the same
    // number the device showed the inspector on site.
    expect(Number(inspection?.rating_percent)).toBe(86.49);
    expect(inspection?.rating_band).toBe("satisfactory");
    expect(inspection?.findings_count).toBe(5);
    expect(inspection?.facility_rep_name).toBe("Aisha Bello");
    expect(Number(inspection?.checkin_distance_m)).toBeLessThan(20);
    expect(inspection?.version_discrepancy).toBe(false);

    const responses = await pg.query<{ response: string; weight: number }>(
      `SELECT response, weight FROM checkpoint_response WHERE inspection_id = $1`,
      [inspectionId],
    );
    expect(responses).toHaveLength(41);
    expect(responses.filter((r) => r.response === "na")).toHaveLength(4);
    expect(responses.filter((r) => r.response === "no")).toHaveLength(5);
    // The weight came from the instrument version, not from the device's claim.
    expect(responses.every((r) => r.weight === 1)).toBe(true);

    const [evidence] = await pg.query<{ object_key: string; locked: boolean; sha: string }>(
      `SELECT object_key, locked, encode(sha256,'hex') AS sha FROM evidence
       WHERE inspection_id = $1`,
      [inspectionId],
    );
    // Content-addressed the moment the capture event landed, before the bytes
    // arrived; locked flips when the upload confirms them.
    expect(evidence?.object_key).toBe(`9c/${evidence?.sha}`);
    expect(evidence?.locked).toBe(false);

    const raised = await pg.query<{ severity: string; status: string; due_date: string }>(
      `SELECT severity, status, due_date FROM finding WHERE inspection_id = $1`,
      [inspectionId],
    );
    expect(raised).toHaveLength(5);
    expect(raised.every((f) => f.status === "open" && f.severity === "minor")).toBe(true);
    expect(raised.every((f) => f.due_date !== null)).toBe(true);
  }, 120_000);

  it("refuses to replay a chain that has been tampered with", async () => {
    const store = nodeSqliteStore();
    applyBootstrap(store, {
      facilities: [
        {
          id: facilityId,
          licenceNumber: "x",
          facilityType: "agro_dealer",
          name: "x",
          lga: null,
          regLat: 12.98547,
          regLng: 7.61893,
          regAccuracyM: 4,
        },
      ],
      instrumentVersions: [
        {
          id: versionId,
          instrumentId: uuidv7(),
          facilityType: "agro_dealer",
          versionLabel: "v3.1",
          satisfactoryMin: 80,
          needsImprovementMin: 60,
          structureHash: structureHashHex,
          structure,
        },
      ],
      priorFindings: [],
    });
    const author = new EventAuthor(
      store,
      { deviceId, sign: (hash) => signEventHash(hash, DEVICE_PRIVATE_KEY) },
      { actorUserId: inspectorId },
    );
    const session = new FieldInspection(store, author);
    const { inspectionId: otherId } = await session.start({
      facilityId,
      jurisdictionCode: "KT",
      at: { lat: 12.98551, lng: 7.61887, accuracyM: 5 },
    });
    await session.recordResponse(otherId, { checkpointRef: "1.1", response: "yes" });

    const events = store.pendingEvents(10).map(toDeviceEvent);
    const tampered = events.map((e, i) =>
      i === 1 ? { ...e, payload: { checkpointRef: "1.1", response: "no" } } : e,
    );

    await expect(ingest.ingest(deviceId, tampered)).rejects.toThrow();
  }, 60_000);

  it("cannot certify while findings are open, and can once they are closed", async () => {
    // The officer records the decision that permits a certificate.
    await inspections.recordDecision(
      officer,
      inspectionId,
      "authorise_certificate",
      "Rating satisfactory; five minor findings raised for closure.",
    );

    await expect(certificates.authorise(officer, inspectionId)).rejects.toThrow(
      /5 finding\(s\) remain open/,
    );

    const open = await pg.query<{ id: string }>(
      `SELECT id FROM finding WHERE inspection_id = $1`,
      [inspectionId],
    );
    for (const finding of open) {
      await findings.submitClosure(officer, finding.id, "Stock segregated and wall repaired.");
      await findings.verifyClosure(officer, finding.id);
    }

    const closed = await pg.query<{ status: string; closed_by_user_id: string }>(
      `SELECT status, closed_by_user_id FROM finding WHERE inspection_id = $1`,
      [inspectionId],
    );
    expect(closed.every((f) => f.status === "closed")).toBe(true);
    // The closure records who verified it; a facility cannot close its own.
    expect(closed.every((f) => f.closed_by_user_id === officerId)).toBe(true);

    const { serial } = await certificates.authorise(officer, inspectionId);
    expect(serial).toMatch(/^AA-T[A-Z0-9]{2}-0417-\d{4}$/);

    const [certificate] = await pg.query<{
      authorising_officer_id: string;
      decision_id: string;
      rating_band: string;
      verification_token: string;
      status: string;
    }>(`SELECT * FROM certificate WHERE inspection_id = $1`, [inspectionId]);

    expect(certificate?.authorising_officer_id).toBe(officerId);
    expect(certificate?.decision_id).toBeTruthy();
    expect(certificate?.rating_band).toBe("satisfactory");
    expect(certificate?.status).toBe("valid");
  }, 120_000);

  it("shows the certificate on the public surface, by token and by licence", async () => {
    const [certificate] = await pg.query<{ verification_token: string; serial: string }>(
      `SELECT verification_token, serial FROM certificate WHERE inspection_id = $1`,
      [inspectionId],
    );

    const [byToken] = await pg.query<{ business_name: string; rating_band: string }>(
      `SELECT * FROM public_certificate_view WHERE verification_token = $1`,
      [certificate!.verification_token],
    );
    expect(byToken?.business_name).toBe("Rimin Zakara Agro Ventures Ltd");
    expect(byToken?.rating_band).toBe("satisfactory");

    // The view carries only disclosable fields; there is nowhere for a finding
    // or a remark to appear even if a caller asked for one.
    expect(Object.keys(byToken ?? {}).sort()).toEqual(
      [
        "business_name",
        "facility_type",
        "issuing_authority",
        "last_inspected",
        "lga",
        "licence_number",
        "rating_band",
        "serial",
        "valid_to",
        "verification_token",
      ].sort(),
    );
  }, 60_000);

  it("stops confirming a revoked certificate without deleting it", async () => {
    const [certificate] = await pg.query<{ id: string }>(
      `SELECT id FROM certificate WHERE inspection_id = $1`,
      [inspectionId],
    );
    await certificates.revoke(officer, certificate!.id, "Stock condition deteriorated on review.");

    const [row] = await pg.query<{ status: string }>(
      `SELECT status FROM certificate WHERE id = $1`,
      [certificate!.id],
    );
    expect(row?.status).toBe("revoked"); // the record survives

    const visible = await pg.query(
      `SELECT 1 FROM public_certificate_view WHERE serial IS NOT NULL AND verification_token IN
         (SELECT verification_token FROM certificate WHERE id = $1)`,
      [certificate!.id],
    );
    expect(visible).toHaveLength(0); // the public page no longer confirms it
  }, 60_000);

  it("rebuilds every projection from the event store alone", async () => {
    const before = await pg.query<{ id: string; rating_percent: string; findings_count: number }>(
      `SELECT id, rating_percent, findings_count FROM inspection WHERE id = $1`,
      [inspectionId],
    );

    await projector.rebuild();

    const after = await pg.query<{ id: string; rating_percent: string; findings_count: number }>(
      `SELECT id, rating_percent, findings_count FROM inspection WHERE id = $1`,
      [inspectionId],
    );
    expect(after).toEqual(before);

    // Everything downstream comes back too, including the certificate and the
    // revocation that followed it.
    const [certificate] = await pg.query<{ status: string; authorising_officer_id: string }>(
      `SELECT status, authorising_officer_id FROM certificate WHERE inspection_id = $1`,
      [inspectionId],
    );
    expect(certificate?.status).toBe("revoked");
    expect(certificate?.authorising_officer_id).toBe(officerId);

    const responses = await pg.query(
      `SELECT 1 FROM checkpoint_response WHERE inspection_id = $1`,
      [inspectionId],
    );
    expect(responses).toHaveLength(41);
  }, 180_000);
});
