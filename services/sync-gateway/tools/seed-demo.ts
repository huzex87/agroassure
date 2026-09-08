import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import {
  bytesToBase64,
  derivePublicKey,
  signEventHash,
  type InstrumentStructure,
} from "@agroassure/domain";
import { AppModule } from "../src/app.module";
import { PgService } from "../src/db/pg.service";
import { ProjectorService } from "../src/projections/projector.service";
import { EventAppender } from "../src/events/event-appender.service";
import { IngestService } from "../src/sync/ingest.service";
import { PgEventStore } from "../src/sync/pg-event-store";
import { RegistryService } from "../src/console/registry.service";
import { InspectionsService } from "../src/console/inspections.service";
import { FindingsService } from "../src/console/findings.service";
import { CertificatesService } from "../src/console/certificates.service";
import { AdminService } from "../src/console/admin.service";
import { PlanningService } from "../src/console/planning.service";
import { QueryService } from "../src/sync/query.service";
import type { Principal } from "../src/common/principal";

// A demo programme with a year of history behind it.
//
// The pilot fixture creates a jurisdiction, an authority and an instrument
// shell — enough to start the application, and nothing to look at. Every chart
// in the console was empty, every table said "nothing yet", and the status
// colours never appeared because nothing was ever in a state worth colouring.
// Someone being shown the platform could not tell whether the programme worked,
// because there was no programme.
//
// This writes one. Every row it produces is derived from an event in the
// append-only store, authored through the same services the console and the
// ingest path use, and signed with a device key where a device would have
// signed it. Rebuild the projections and all of it comes back — which is the
// point, because seeded rows written straight into the read models would be a
// demonstration of something this platform does not do.
//
//   DATABASE_URL=postgres://... pnpm --filter @agroassure/sync-gateway seed:demo
//
// Re-runnable. Fictional throughout: the businesses do not exist, and the
// people are the seeded demo accounts.

/** Every licence this script issues carries it, so a re-run knows its own work. */
const DEMO_PREFIX = "FISS/KT/DEMO/";

// A key per run, because the hash chain is per device and this script authors
// from a fresh in-memory store every time. A store that does not know the
// server's current chain head would start at prevHash null and be refused —
// correctly — so each run is simply a new handset instead. The private halves
// are derived and not secret, which is true of nothing but a demo.
function deviceKey(n: number): Uint8Array {
  const k = new Uint8Array(32);
  for (let i = 0; i < 32; i++) k[i] = (i * 29 + 11 + n * 7) & 0xff;
  return k;
}

/** Deterministic, so two runs produce the same programme. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const LGAS = [
  "Katsina",
  "Daura",
  "Funtua",
  "Malumfashi",
  "Dutsin-Ma",
  "Kankia",
  "Bakori",
  "Jibia",
];

// Names built from real Katsina place names and ordinary trading-company
// suffixes. Fictional businesses, plausible register.
const STEMS = [
  "Rimin Zakara", "Danmarke", "Sabon Gari", "Kofar Marusa", "Yandaka",
  "Gambarawa", "Tsagem", "Mashi", "Charanchi", "Kurfi", "Batagarawa",
  "Dandagoro", "Zango", "Ruwan Godiya", "Wagini", "Bindawa", "Yargoje",
  "Karaduwa", "Makera", "Shinkafi", "Gozaki", "Dabai", "Kandawa", "Turbe",
];
const SUFFIXES = [
  "Agro Ventures Ltd", "Agro Supplies", "Farm Inputs Ltd", "Agro Services",
  "Agrochemicals Ltd", "Fertilizer Depot", "Agro Stores", "Farm Centre",
];

const TYPES = ["agro_dealer", "agro_dealer", "agro_dealer", "blending_plant", "importer"] as const;

/** Katsina sits around 12.99N, 7.60E. Scatter the register plausibly around it. */
function point(pick: () => number) {
  return {
    lat: 12.4 + pick() * 1.3,
    lng: 7.0 + pick() * 1.4,
    accuracyM: 4 + Math.round(pick() * 8),
  };
}

function isoDay(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function isoAt(daysAgo: number, hour: number): string {
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  d.setUTCHours(hour, (hour * 7) % 60, 0, 0);
  return d.toISOString();
}

/** Nine sections, forty-one checkpoints — the shape of the real instrument. */
function structure(): InstrumentStructure {
  const titles: Array<[string, string]> = [
    ["Premises and storage", "Wurin ajiya da gini"],
    ["Product integrity", "Ingancin kaya"],
    ["Labelling and documentation", "Lakabi da takardu"],
    ["Weights and measures", "Awo da ma'auni"],
    ["Handling and dispensing", "Sarrafawa da rabawa"],
    ["Staff competence", "Ƙwarewar ma'aikata"],
    ["Protective equipment", "Kayan kariya"],
    ["Waste and spillage", "Shara da zubewa"],
    ["Records and traceability", "Rikodi da bibiya"],
  ];
  const counts = [5, 5, 5, 4, 5, 4, 5, 4, 4];
  return {
    sections: titles.map(([titleEn, titleHa], i) => ({
      ordinal: i + 1,
      titleEn,
      titleHa,
      checkpoints: Array.from({ length: counts[i]! }, (_, c) => ({
        ordinal: c + 1,
        promptEn: `${titleEn}: requirement ${c + 1} is met`,
        promptHa: `${titleHa}: an cika sharaɗi na ${c + 1}`,
        // Weighted, so the score is not a plain count and the sections that
        // matter to product safety move the number more.
        weight: i <= 1 ? 3 : i <= 4 ? 2 : 1,
        severityOnFail: (i <= 1 ? "critical" : i <= 4 ? "major" : "minor") as
          | "critical"
          | "major"
          | "minor",
        allowsNa: i === 6,
      })),
    })),
  };
}

async function main(): Promise<void> {
  const log = new Logger("SeedDemo");
  process.env.PROJECTOR_SWEEP = "off";
  process.env.ESCALATION_SWEEP = "off";

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["log", "error", "warn"],
  });

  const pg = app.get(PgService);
  const projector = app.get(ProjectorService);
  const appender = app.get(EventAppender);
  const ingest = new IngestService(new PgEventStore(pg));
  const registry = new RegistryService(pg, appender);
  const inspections = new InspectionsService(pg, appender);
  const findings = app.get(FindingsService);
  const certificates = app.get(CertificatesService);
  const admin = app.get(AdminService);
  const planning = app.get(PlanningService);
  const queries = app.get(QueryService);

  try {
    const [jurisdiction] = await pg.query<{ id: string }>(
      `SELECT id FROM jurisdiction WHERE code = 'KT'`,
    );
    if (!jurisdiction) throw new Error("no Katsina jurisdiction: run the pilot seed first");
    const jurisdictionId = jurisdiction.id;

    const people = await pg.query<{ id: string; full_name: string; roles: string[] }>(
      `SELECT u.id, u.full_name,
              coalesce(array_agg(r.role_code) FILTER (WHERE r.role_code IS NOT NULL), '{}') AS roles
         FROM app_user u LEFT JOIN user_role r ON r.user_id = u.id
        WHERE u.jurisdiction_id = $1 AND u.status = 'active'
        GROUP BY u.id, u.full_name`,
      [jurisdictionId],
    );
    const inspectorRow = people.find((p) => p.roles.includes("inspector"));
    const officerRow = people.find((p) => p.roles.includes("authorising_officer"));
    const adminRow = people.find((p) => p.roles.includes("state_admin"));
    if (!inspectorRow || !officerRow || !adminRow) {
      throw new Error("the demo users are missing: run the pilot seed first");
    }

    const inspector: Principal = {
      userId: inspectorRow.id,
      deviceId: null,
      jurisdictionId,
      roles: ["inspector"],
    };
    const officer: Principal = {
      userId: officerRow.id,
      deviceId: null,
      jurisdictionId,
      roles: ["desk_supervisor", "authorising_officer"],
    };
    const stateAdmin: Principal = {
      userId: adminRow.id,
      deviceId: null,
      jurisdictionId,
      roles: ["state_admin"],
    };

    // ---- a device to author with ------------------------------------------
    const [priorDevices] = await pg.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM device WHERE label LIKE 'Demo handset%'`,
    );
    const run = Number(priorDevices?.count ?? 0) + 1;
    const privateKey = deviceKey(run);
    const deviceId = await admin.enrollDevice(stateAdmin, {
      assignedUserId: inspectorRow.id,
      label: `Demo handset ${run}`,
      publicKeyBase64: bytesToBase64(derivePublicKey(privateKey)),
    });
    await pg.query(`UPDATE device SET status = 'active' WHERE id = $1`, [deviceId]);

    log.log(`authoring as ${inspectorRow.full_name} on demo handset ${run}`);

    // ---- the instrument, published and frozen ------------------------------
    const shape = structure();
    const [instrument] = await pg.query<{ id: string }>(
      `SELECT id FROM instrument WHERE jurisdiction_id = $1 AND facility_type = 'agro_dealer'`,
      [jurisdictionId],
    );
    if (!instrument) throw new Error("no agro_dealer instrument: run the pilot seed first");

    let [version] = await pg.query<{ id: string }>(
      `SELECT id FROM instrument_version
        WHERE instrument_id = $1 AND status = 'in_force'
        ORDER BY effective_from DESC LIMIT 1`,
      [instrument.id],
    );
    if (!version) {
      [version] = await pg.query<{ id: string }>(
        `INSERT INTO instrument_version
           (instrument_id, version_label, status, effective_from, structure_hash)
         VALUES ($1, 'v4.0', 'in_force', current_date - 400, decode($2,'hex')) RETURNING id`,
        [instrument.id, "d3m0" + "0".repeat(12)],
      );
    }
    const versionId = version!.id;

    const [checkpointRow] = await pg.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM checkpoint c
         JOIN section s ON s.id = c.section_id WHERE s.instrument_version_id = $1`,
      [versionId],
    );
    if (Number(checkpointRow?.count ?? 0) === 0) {
      for (const section of shape.sections) {
        const [row] = await pg.query<{ id: string }>(
          `INSERT INTO section (instrument_version_id, ordinal, title_en, title_ha)
           VALUES ($1,$2,$3,$4) RETURNING id`,
          [versionId, section.ordinal, section.titleEn, section.titleHa],
        );
        for (const cp of section.checkpoints) {
          await pg.query(
            `INSERT INTO checkpoint
               (section_id, ordinal, prompt_en, prompt_ha, weight, severity_on_fail, allows_na)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [row!.id, cp.ordinal, cp.promptEn, cp.promptHa, cp.weight, cp.severityOnFail, cp.allowsNa],
          );
        }
      }
      log.log("published instrument v4.0: 9 sections, 41 checkpoints");
    }

    // ---- the register ------------------------------------------------------
    const pick = rng(20260907);
    const [registered] = await pg.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM facility WHERE licence_number LIKE $1`,
      [`${DEMO_PREFIX}%`],
    );
    const already = Number(registered?.count ?? 0);
    const TARGET = 42;

    // Top up rather than skip. A previous run that stopped part way should be
    // completable, and the register is the thing every other figure is a
    // proportion of — a half-built one makes coverage meaningless.
    for (let i = already; i < TARGET; i++) {
      await registry.register(officer, {
        licenceNumber: `${DEMO_PREFIX}${String(2026 - (i % 3))}/${String(1000 + i)}`,
        facilityType: TYPES[i % TYPES.length]!,
        name: `${STEMS[i % STEMS.length]} ${SUFFIXES[Math.floor(i / STEMS.length) % SUFFIXES.length]}`,
        lga: LGAS[i % LGAS.length]!,
        // One in eight has no recorded point, which is honest: a register built
        // from paper files always has gaps, and the map has to say so.
        registeredPoint: i % 8 === 3 ? undefined : point(pick),
      });
    }
    if (TARGET > already) {
      log.log(`registered ${TARGET - already} facilities (register now ${TARGET})`);
    } else {
      log.log(`register already holds ${already} facilities`);
    }

    // ---- a year of inspections --------------------------------------------
    // Read from the version actually in force, never from this file's own idea
    // of it: a jurisdiction that already published an instrument keeps it, and
    // answering checkpoints that are not on it is refused by the device code —
    // correctly, since an inspection is bound to the version it was worked
    // against.
    const checkpoints = await pg.query<{ ref: string; allows_na: boolean }>(
      `SELECT s.ordinal || '.' || c.ordinal AS ref, c.allows_na
         FROM checkpoint c JOIN section s ON s.id = c.section_id
        WHERE s.instrument_version_id = $1
        ORDER BY s.ordinal, c.ordinal`,
      [versionId],
    );
    const refs = checkpoints.map((c) => c.ref);
    const naCapable = checkpoints.filter((c) => c.allows_na).map((c) => c.ref);
    log.log(`instrument in force has ${refs.length} checkpoints`);

    // Four fifths of the register is meant to have been visited, so coverage
    // lands somewhere a director would recognise rather than at 100%. Whichever
    // of those have not been visited yet get visited now, which makes a run
    // that stopped half way completable rather than permanently half done.
    // Agro-dealers only: the pilot has published one instrument, and an
    // operator class with no instrument in force cannot be inspected. The
    // blending plants and importers on the register stay uninspected, which is
    // a true thing for the register to show rather than a gap to paper over.
    const unvisited = await pg.query<{ id: string; name: string; lga: string }>(
      `SELECT f.id, f.name, f.lga FROM facility f
        WHERE f.licence_number LIKE $1
          AND f.facility_type = 'agro_dealer'
          AND NOT EXISTS (SELECT 1 FROM inspection i WHERE i.facility_id = f.id)
        ORDER BY f.licence_number
        LIMIT 22`,
      [`${DEMO_PREFIX}%`],
    );
    if (unvisited.length === 0) {
      log.log("every facility marked for a visit already has one");
    } else {
      const { FieldInspection, EventAuthor, applyBootstrap, toDeviceEvent } = await import(
        "@agroassure/field-core"
      );
      const { nodeSqliteStore } = await import("./demo-store");

      const visits = unvisited;

      // Every assignment first, then one bootstrap: the device is handed its
      // whole day at once, which is what a real handset does before leaving.
      for (const facility of visits) {
        const daysAgo = 20 + Math.floor(pick() * 330);
        await planning.createAssignment(officer, {
          facilityId: facility.id,
          assignedToUserId: inspectorRow.id,
          kind: pick() < 0.4 ? "risk_targeted" : "routine",
          reason:
            pick() < 0.4
              ? "certificate expiring within 30 days"
              : "routine cycle: not visited in six months",
          dueBy: isoDay(Math.max(1, daysAgo - 7)),
        });
      }

      // One store and one author for the whole run, because the hash chain is
      // per device and not per visit. A fresh store each time would start every
      // batch at prevHash null while the server's head had already advanced —
      // which ingest correctly refuses as a broken chain.
      const store = nodeSqliteStore();
      applyBootstrap(store, await queries.bootstrap(inspectorRow.id, jurisdictionId));

      const author = new EventAuthor(
        store,
        { deviceId, sign: (hash: string) => signEventHash(hash, privateKey) },
        { actorUserId: inspectorRow.id },
      );
      const session = new FieldInspection(store, author);

      let n = 0;
      for (const facility of visits) {
        const daysAgo = 20 + Math.floor(pick() * 330);
        const started = await session.start({
          facilityId: facility.id,
          jurisdictionCode: "KT",
          at: point(pick),
        });

        // A spread of standards: most sites pass, a few need work, a couple are
        // in real trouble. Without the bad ones the console never shows a
        // colour, and a demo where nothing is ever wrong demonstrates nothing.
        //
        // As a proportion of the instrument, never a count. Fixed counts were
        // written against a 41-checkpoint form and then run against the
        // 5-checkpoint one actually in force, so every inspection failed every
        // checkpoint and the whole programme scored zero — which reads as a
        // broken console rather than as a failing market.
        const roll = pick();
        const share =
          roll < 0.6
            ? 0.02 + pick() * 0.08 // comfortably satisfactory
            : roll < 0.87
              ? 0.18 + pick() * 0.14 // needs improvement
              : 0.4 + pick() * 0.2; // critical
        const failures = Math.max(
          roll < 0.6 ? 0 : 1,
          Math.round(refs.length * share),
        );

        const naRefs = pick() < 0.4 ? naCapable.slice(0, 3) : [];
        const noRefs = refs.filter((r) => !naRefs.includes(r)).slice(0, failures);

        for (const ref of refs) {
          if (naRefs.includes(ref)) {
            await session.recordResponse(started.inspectionId, {
              checkpointRef: ref,
              response: "na",
            });
          } else if (noRefs.includes(ref)) {
            await session.recordResponse(started.inspectionId, {
              checkpointRef: ref,
              response: "no",
              remark:
                "Observed on site and photographed; the manager was shown the finding before sign-off.",
            });
          } else {
            await session.recordResponse(started.inspectionId, {
              checkpointRef: ref,
              response: "yes",
            });
          }
        }

        await session.submit(started.inspectionId, {
          inspectorUserId: inspectorRow.id,
          inspectorSignedAt: isoAt(daysAgo, 10),
          facilityRep: {
            name: "Site Manager",
            role: "Warehouse Manager",
            signedAt: isoAt(daysAgo, 10),
          },
        });
        n += 1;
      }

      // One push, in authoring order, the way a handset syncs at the end of a day.
      const queued = store.pendingEvents(20_000);
      const ack = await ingest.ingest(deviceId, queued.map(toDeviceEvent));
      store.markAcked(ack.acked);

      await projector.applyPending();
      log.log(`authored ${n} inspections through the real ingest path`);
    }

    // ---- decisions, closures and certificates ------------------------------
    const submitted = await pg.query<{ id: string; rating_band: string; submitted_at: string }>(
      `SELECT i.id, i.rating_band, i.submitted_at
         FROM inspection i JOIN facility f ON f.id = i.facility_id
        WHERE f.licence_number LIKE $1 AND i.status = 'submitted'
          AND NOT EXISTS (SELECT 1 FROM decision d WHERE d.inspection_id = i.id)
        ORDER BY i.submitted_at`,
      [`${DEMO_PREFIX}%`],
    );

    let decided = 0;
    let issued = 0;
    for (const inspection of submitted) {
      // Not every inspection gets a decision: some are genuinely still waiting,
      // which is what makes the "decisions within 30 days" figure mean anything.
      if (pick() < 0.12) continue;

      const band = inspection.rating_band;
      const type =
        band === "satisfactory"
          ? "authorise_certificate"
          : band === "needs_improvement"
            ? "direct_follow_up"
            : "escalate";
      await inspections.recordDecision(
        officer,
        inspection.id,
        type as never,
        band === "satisfactory"
          ? "Rating meets the threshold and no critical finding is outstanding."
          : "Corrective action directed; re-inspection on the next cycle.",
      );
      decided += 1;

      // Close most findings, leave some running, and let a few go past their
      // date — the worklist is the page a supervisor lives on and an empty one
      // shows nothing about how it behaves.
      const open = await pg.query<{ id: string }>(
        `SELECT id FROM finding WHERE inspection_id = $1 AND status <> 'closed'`,
        [inspection.id],
      );
      for (const finding of open) {
        if (pick() > 0.62) continue;
        await findings.submitClosure(
          officer,
          finding.id,
          "Corrective action completed and verified on a return visit.",
        );
        await findings.verifyClosure(officer, finding.id);
      }

      if (type === "authorise_certificate") {
        const stillOpen = await pg.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM finding
            WHERE inspection_id = $1 AND status <> 'closed' AND severity = 'critical'`,
          [inspection.id],
        );
        if (Number(stillOpen[0]?.count ?? 0) === 0) {
          try {
            await certificates.authorise(officer, inspection.id);
            issued += 1;
          } catch {
            // The invariant refused it. That is the invariant doing its job and
            // is not this script's business to work around.
          }
        }
      }
    }

    await projector.applyPending();
    log.log(`recorded ${decided} decisions and issued ${issued} certificates`);

    // ---- what is dated when, and what is not ------------------------------
    //
    // The inspections carry real dates across twelve months, because the
    // projector takes submitted_at from the time the inspector signed on site
    // rather than from when the events reached the server. So coverage, the
    // compliance trend and findings-raised all have a year of shape behind
    // them.
    //
    // The decisions and the certificates are dated today, and they are not
    // backdated, because they genuinely were taken today. Doing otherwise would
    // mean either rewriting event_store — which carries a trigger refusing
    // UPDATE and DELETE, and that trigger is the most important thing in the
    // schema — or adding a backdating parameter to the decision and certificate
    // APIs, which is a capability a compliance platform should not grow for the
    // convenience of a demo. A regulator working through a year of backlog is
    // an honest thing for this data to show.
    const replayed = await projector.rebuild();
    log.log(`replayed ${replayed} events into the read models`);

    const [summary] = await pg.query<Record<string, string>>(
      `SELECT
         (SELECT count(*)::text FROM facility WHERE licence_number LIKE $1) AS facilities,
         (SELECT count(*)::text FROM inspection i JOIN facility f ON f.id = i.facility_id
           WHERE f.licence_number LIKE $1) AS inspections,
         (SELECT count(*)::text FROM finding fd JOIN inspection i ON i.id = fd.inspection_id
           JOIN facility f ON f.id = i.facility_id WHERE f.licence_number LIKE $1) AS findings,
         (SELECT count(*)::text FROM finding fd JOIN inspection i ON i.id = fd.inspection_id
           JOIN facility f ON f.id = i.facility_id
           WHERE f.licence_number LIKE $1 AND fd.status <> 'closed') AS open_findings,
         (SELECT count(*)::text FROM certificate c JOIN facility f ON f.id = c.facility_id
           WHERE f.licence_number LIKE $1) AS certificates`,
      [`${DEMO_PREFIX}%`],
    );
    log.log(
      `demo programme: ${summary?.facilities} facilities, ${summary?.inspections} inspections, ` +
        `${summary?.findings} findings (${summary?.open_findings} open), ` +
        `${summary?.certificates} certificates`,
    );
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("seed-demo failed:", err);
  process.exit(1);
});
