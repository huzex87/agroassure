import type { CheckpointResponse, FindingSeverity } from "@agroassure/domain";

// The on-device store: the reference data the inspector needs for the day, the
// local projections they read while working, and an append-only outbox of the
// events they have authored but not yet synced.
//
// One deviation from the reference DDL, made deliberately: hashes and signatures
// are TEXT (hex and base64) rather than BLOB. The on-device format has no
// interop consequence — the wire format is hex and base64 JSON either way — and
// binding blobs is the one thing every React Native SQLite driver does
// differently. Keeping them as text means the same store code runs on op-sqlite,
// expo-sqlite, and node:sqlite without a per-driver branch.
//
// A second deviation, for the same reason of removing a failure mode: there is
// no chain_head or hlc_state table. Both are simply "the last event this device
// authored", so they are read from the outbox by insertion order instead of
// being maintained alongside it. A separate copy could fall out of step with the
// outbox after a crash between two writes, and a chain head that disagrees with
// the log is exactly the corruption the chain exists to detect.

/**
 * The seam between this package and whichever SQLite driver the app uses. It is
 * deliberately tiny: an adapter for op-sqlite, expo-sqlite, or node:sqlite is a
 * few lines, and nothing else in this package knows a driver exists.
 */
export interface SqliteDriver {
  /** Run a statement. Returns the rows for a SELECT, an empty array otherwise. */
  run(sql: string, params?: readonly unknown[]): Array<Record<string, unknown>>;
}

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS assigned_facility (
  id TEXT PRIMARY KEY, licence_number TEXT, facility_type TEXT, name TEXT,
  address_json TEXT, lga TEXT, reg_lat REAL, reg_lng REAL, reg_accuracy_m REAL
);

CREATE TABLE IF NOT EXISTS instrument_version_local (
  id TEXT PRIMARY KEY, instrument_id TEXT, facility_type TEXT, version_label TEXT,
  satisfactory_min REAL, needs_improve_min REAL, structure_hash TEXT, structure_json TEXT
);

CREATE TABLE IF NOT EXISTS prior_finding (
  id TEXT PRIMARY KEY, facility_id TEXT, reference TEXT, summary TEXT,
  severity TEXT, status TEXT, due_date TEXT
);

CREATE TABLE IF NOT EXISTS local_inspection (
  id TEXT PRIMARY KEY, reference TEXT, facility_id TEXT, instrument_version_id TEXT,
  structure_hash TEXT, checkin_lat REAL, checkin_lng REAL, checkin_accuracy_m REAL,
  checkin_distance_m REAL, checkin_flagged INTEGER DEFAULT 0,
  status TEXT DEFAULT 'in_progress', rating_percent REAL, rating_band TEXT,
  inspector_signed_at TEXT, facility_signed_at TEXT, facility_rep_name TEXT,
  submitted_at TEXT
);

CREATE TABLE IF NOT EXISTS local_response (
  id TEXT PRIMARY KEY, inspection_id TEXT, checkpoint_ref TEXT,
  response TEXT CHECK (response IN ('yes','no','na')),
  remark TEXT, weight INTEGER DEFAULT 1, recorded_hlc TEXT,
  UNIQUE (inspection_id, checkpoint_ref)
);

CREATE TABLE IF NOT EXISTS local_evidence (
  evidence_id TEXT PRIMARY KEY, inspection_id TEXT, checkpoint_ref TEXT,
  sha256 TEXT NOT NULL, local_uri TEXT NOT NULL, mime TEXT NOT NULL,
  captured_at TEXT NOT NULL, lat REAL, lng REAL, accuracy_m REAL,
  upload_state TEXT NOT NULL DEFAULT 'pending'
);

-- Append-only: a row is written once and only sync_state ever changes,
-- from 'pending' to 'acked'.
CREATE TABLE IF NOT EXISTS outbox_event (
  event_id TEXT PRIMARY KEY, aggregate_type TEXT NOT NULL, aggregate_id TEXT NOT NULL,
  seq INTEGER NOT NULL, event_type TEXT NOT NULL, payload_json TEXT NOT NULL,
  hlc TEXT NOT NULL, prev_hash TEXT, event_hash TEXT NOT NULL, device_sig TEXT NOT NULL,
  actor_user_id TEXT, device_id TEXT NOT NULL,
  sync_state TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  UNIQUE (aggregate_type, aggregate_id, seq)
);
CREATE INDEX IF NOT EXISTS outbox_pending ON outbox_event (sync_state, created_at);

CREATE TABLE IF NOT EXISTS pull_cursor (name TEXT PRIMARY KEY, cursor TEXT);
`;

export interface AssignedFacility {
  id: string;
  licenceNumber: string;
  facilityType: string;
  name: string;
  lga: string | null;
  regLat: number | null;
  regLng: number | null;
  regAccuracyM: number | null;
}

export interface LocalInstrumentVersion {
  id: string;
  instrumentId: string;
  facilityType: string;
  versionLabel: string;
  satisfactoryMin: number;
  needsImprovementMin: number;
  structureHash: string;
  /** The frozen structure, as published. Sections, checkpoints, weights. */
  structure: InstrumentStructure;
}

export interface InstrumentStructure {
  sections: Array<{
    ordinal: number;
    titleEn: string;
    titleHa: string;
    checkpoints: Array<{
      ordinal: number;
      promptEn: string;
      promptHa: string;
      weight: number;
      severityOnFail: FindingSeverity;
      allowsNa: boolean;
    }>;
  }>;
}

export interface LocalResponse {
  checkpointRef: string;
  response: CheckpointResponse;
  remark: string | null;
  weight: number;
}

export interface PendingEvidence {
  evidenceId: string;
  inspectionId: string;
  checkpointRef: string;
  sha256: string;
  localUri: string;
  mime: string;
}

export interface OutboxRow {
  event_id: string;
  aggregate_type: string;
  aggregate_id: string;
  seq: number;
  event_type: string;
  payload_json: string;
  hlc: string;
  prev_hash: string | null;
  event_hash: string;
  device_sig: string;
  actor_user_id: string | null;
  device_id: string;
}

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v);
}

function nullableNum(v: unknown): number | null {
  return v === null || v === undefined ? null : num(v);
}

function str(v: unknown): string {
  return String(v);
}

function nullableStr(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

export class FieldStore {
  constructor(private readonly db: SqliteDriver) {}

  migrate(): void {
    for (const statement of SCHEMA.split(";")) {
      if (statement.trim()) this.db.run(statement);
    }
  }

  // ---- reference data, replaced wholesale at each bootstrap ---------------

  replaceAssignedFacilities(facilities: AssignedFacility[]): void {
    this.db.run("DELETE FROM assigned_facility");
    for (const f of facilities) {
      this.db.run(
        `INSERT INTO assigned_facility
           (id, licence_number, facility_type, name, lga, reg_lat, reg_lng, reg_accuracy_m)
         VALUES (?,?,?,?,?,?,?,?)`,
        [f.id, f.licenceNumber, f.facilityType, f.name, f.lga, f.regLat, f.regLng, f.regAccuracyM],
      );
    }
  }

  facility(id: string): AssignedFacility | null {
    const row = this.db.run(`SELECT * FROM assigned_facility WHERE id = ?`, [id])[0];
    if (!row) return null;
    return {
      id: str(row.id),
      licenceNumber: str(row.licence_number),
      facilityType: str(row.facility_type),
      name: str(row.name),
      lga: nullableStr(row.lga),
      regLat: nullableNum(row.reg_lat),
      regLng: nullableNum(row.reg_lng),
      regAccuracyM: nullableNum(row.reg_accuracy_m),
    };
  }

  replaceInstrumentVersions(versions: LocalInstrumentVersion[]): void {
    this.db.run("DELETE FROM instrument_version_local");
    for (const v of versions) {
      this.db.run(
        `INSERT INTO instrument_version_local
           (id, instrument_id, facility_type, version_label, satisfactory_min,
            needs_improve_min, structure_hash, structure_json)
         VALUES (?,?,?,?,?,?,?,?)`,
        [
          v.id,
          v.instrumentId,
          v.facilityType,
          v.versionLabel,
          v.satisfactoryMin,
          v.needsImprovementMin,
          v.structureHash,
          JSON.stringify(v.structure),
        ],
      );
    }
  }

  /** The version in force for a facility type, as downloaded before departure. */
  instrumentVersionForType(facilityType: string): LocalInstrumentVersion | null {
    const row = this.db.run(`SELECT * FROM instrument_version_local WHERE facility_type = ?`, [
      facilityType,
    ])[0];
    return row ? this.toVersion(row) : null;
  }

  instrumentVersion(id: string): LocalInstrumentVersion | null {
    const row = this.db.run(`SELECT * FROM instrument_version_local WHERE id = ?`, [id])[0];
    return row ? this.toVersion(row) : null;
  }

  private toVersion(row: Record<string, unknown>): LocalInstrumentVersion {
    return {
      id: str(row.id),
      instrumentId: str(row.instrument_id),
      facilityType: str(row.facility_type),
      versionLabel: str(row.version_label),
      satisfactoryMin: num(row.satisfactory_min),
      needsImprovementMin: num(row.needs_improve_min),
      structureHash: str(row.structure_hash),
      structure: JSON.parse(str(row.structure_json)) as InstrumentStructure,
    };
  }

  replacePriorFindings(
    findings: Array<{
      id: string;
      facilityId: string;
      reference: string;
      summary: string;
      severity: string;
      status: string;
      dueDate: string | null;
    }>,
  ): void {
    this.db.run("DELETE FROM prior_finding");
    for (const f of findings) {
      this.db.run(
        `INSERT INTO prior_finding (id, facility_id, reference, summary, severity, status, due_date)
         VALUES (?,?,?,?,?,?,?)`,
        [f.id, f.facilityId, f.reference, f.summary, f.severity, f.status, f.dueDate],
      );
    }
  }

  updatePriorFindingStatus(findingId: string, status: string): void {
    this.db.run(`UPDATE prior_finding SET status = ? WHERE id = ?`, [status, findingId]);
  }

  priorFindings(facilityId: string): Array<Record<string, unknown>> {
    return this.db.run(
      `SELECT * FROM prior_finding WHERE facility_id = ? AND status <> 'closed'`,
      [facilityId],
    );
  }

  // ---- the inspection being worked ---------------------------------------

  insertInspection(i: {
    id: string;
    reference: string;
    facilityId: string;
    instrumentVersionId: string;
    structureHash: string;
    checkinLat: number;
    checkinLng: number;
    checkinAccuracyM: number | null;
    checkinDistanceM: number;
    checkinFlagged: boolean;
  }): void {
    this.db.run(
      `INSERT INTO local_inspection
         (id, reference, facility_id, instrument_version_id, structure_hash,
          checkin_lat, checkin_lng, checkin_accuracy_m, checkin_distance_m, checkin_flagged)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        i.id,
        i.reference,
        i.facilityId,
        i.instrumentVersionId,
        i.structureHash,
        i.checkinLat,
        i.checkinLng,
        i.checkinAccuracyM,
        i.checkinDistanceM,
        i.checkinFlagged ? 1 : 0,
      ],
    );
  }

  inspection(id: string): Record<string, unknown> | null {
    return this.db.run(`SELECT * FROM local_inspection WHERE id = ?`, [id])[0] ?? null;
  }

  markSubmitted(
    id: string,
    rating: { percent: number; band: string },
    signatures: { inspectorSignedAt: string; repName: string; repSignedAt: string },
    submittedAt: string,
  ): void {
    this.db.run(
      `UPDATE local_inspection
          SET status = 'submitted', rating_percent = ?, rating_band = ?,
              inspector_signed_at = ?, facility_rep_name = ?, facility_signed_at = ?,
              submitted_at = ?
        WHERE id = ?`,
      [
        rating.percent,
        rating.band,
        signatures.inspectorSignedAt,
        signatures.repName,
        signatures.repSignedAt,
        submittedAt,
        id,
      ],
    );
  }

  upsertResponse(
    inspectionId: string,
    r: LocalResponse & { id: string; recordedHlc: string },
  ): void {
    // A response is corrected in place while the inspection is open; the event
    // trail behind it keeps every version, so nothing is lost by doing so.
    this.db.run(
      `INSERT INTO local_response
         (id, inspection_id, checkpoint_ref, response, remark, weight, recorded_hlc)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT (inspection_id, checkpoint_ref)
       DO UPDATE SET response = excluded.response, remark = excluded.remark,
                     recorded_hlc = excluded.recorded_hlc`,
      [r.id, inspectionId, r.checkpointRef, r.response, r.remark, r.weight, r.recordedHlc],
    );
  }

  responses(inspectionId: string): LocalResponse[] {
    return this.db
      .run(`SELECT * FROM local_response WHERE inspection_id = ?`, [inspectionId])
      .map((row) => ({
        checkpointRef: str(row.checkpoint_ref),
        response: str(row.response) as CheckpointResponse,
        remark: nullableStr(row.remark),
        weight: num(row.weight),
      }));
  }

  insertEvidence(e: {
    evidenceId: string;
    inspectionId: string;
    checkpointRef: string;
    sha256: string;
    localUri: string;
    mime: string;
    capturedAt: string;
    lat: number | null;
    lng: number | null;
    accuracyM: number | null;
  }): void {
    this.db.run(
      `INSERT INTO local_evidence
         (evidence_id, inspection_id, checkpoint_ref, sha256, local_uri, mime,
          captured_at, lat, lng, accuracy_m)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        e.evidenceId,
        e.inspectionId,
        e.checkpointRef,
        e.sha256,
        e.localUri,
        e.mime,
        e.capturedAt,
        e.lat,
        e.lng,
        e.accuracyM,
      ],
    );
  }

  pendingEvidence(limit = 20): PendingEvidence[] {
    return this.db
      .run(`SELECT * FROM local_evidence WHERE upload_state = 'pending' LIMIT ?`, [limit])
      .map((row) => ({
        evidenceId: str(row.evidence_id),
        inspectionId: str(row.inspection_id),
        checkpointRef: str(row.checkpoint_ref),
        sha256: str(row.sha256),
        localUri: str(row.local_uri),
        mime: str(row.mime),
      }));
  }

  markEvidenceUploaded(evidenceId: string): void {
    this.db.run(`UPDATE local_evidence SET upload_state = 'uploaded' WHERE evidence_id = ?`, [
      evidenceId,
    ]);
  }

  // ---- outbox and chain ---------------------------------------------------

  nextSeq(aggregateType: string, aggregateId: string): number {
    const row = this.db.run(
      `SELECT coalesce(max(seq), 0) AS s FROM outbox_event
        WHERE aggregate_type = ? AND aggregate_id = ?`,
      [aggregateType, aggregateId],
    )[0];
    return num(row?.s ?? 0) + 1;
  }

  /**
   * The hash of the last event this device authored, which the next event links
   * to. Read from the outbox rather than tracked separately, so it cannot
   * disagree with the log it describes. Insertion order is authoring order.
   */
  chainHead(): string | null {
    const row = this.db.run(
      `SELECT event_hash FROM outbox_event ORDER BY rowid DESC LIMIT 1`,
    )[0];
    return row ? str(row.event_hash) : null;
  }

  /** The HLC stamp of the last authored event, for resuming after a restart. */
  lastHlc(): string | null {
    const row = this.db.run(`SELECT hlc FROM outbox_event ORDER BY rowid DESC LIMIT 1`)[0];
    return row ? str(row.hlc) : null;
  }

  appendOutbox(row: OutboxRow & { createdAt: string }): void {
    this.db.run(
      `INSERT INTO outbox_event
         (event_id, aggregate_type, aggregate_id, seq, event_type, payload_json, hlc,
          prev_hash, event_hash, device_sig, actor_user_id, device_id, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        row.event_id,
        row.aggregate_type,
        row.aggregate_id,
        row.seq,
        row.event_type,
        row.payload_json,
        row.hlc,
        row.prev_hash,
        row.event_hash,
        row.device_sig,
        row.actor_user_id,
        row.device_id,
        row.createdAt,
      ],
    );
  }

  /** Pending events in authoring order: the order the chain must be pushed in. */
  pendingEvents(limit = 200): OutboxRow[] {
    return this.db
      .run(
        `SELECT * FROM outbox_event WHERE sync_state = 'pending'
          ORDER BY rowid LIMIT ?`,
        [limit],
      )
      .map((row) => ({
        event_id: str(row.event_id),
        aggregate_type: str(row.aggregate_type),
        aggregate_id: str(row.aggregate_id),
        seq: num(row.seq),
        event_type: str(row.event_type),
        payload_json: str(row.payload_json),
        hlc: str(row.hlc),
        prev_hash: nullableStr(row.prev_hash),
        event_hash: str(row.event_hash),
        device_sig: str(row.device_sig),
        actor_user_id: nullableStr(row.actor_user_id),
        device_id: str(row.device_id),
      }));
  }

  markAcked(eventIds: string[]): void {
    for (const id of eventIds) {
      this.db.run(`UPDATE outbox_event SET sync_state = 'acked' WHERE event_id = ?`, [id]);
    }
  }

  /** The number behind the app's "Offline (3 queued)" badge. */
  pendingCount(): number {
    const row = this.db.run(`SELECT count(*) AS n FROM outbox_event WHERE sync_state = 'pending'`)[0];
    return num(row?.n ?? 0);
  }

  // ---- cursors ------------------------------------------------------------

  cursor(name: string): string | null {
    const row = this.db.run(`SELECT cursor FROM pull_cursor WHERE name = ?`, [name])[0];
    return row ? nullableStr(row.cursor) : null;
  }

  setCursor(name: string, cursor: string): void {
    this.db.run(
      `INSERT INTO pull_cursor (name, cursor) VALUES (?,?)
       ON CONFLICT (name) DO UPDATE SET cursor = excluded.cursor`,
      [name, cursor],
    );
  }
}
