import { Injectable, Logger } from "@nestjs/common";
import type { PoolClient } from "pg";
import {
  DEFAULT_SLA,
  dueDateFor,
  scoreInspection,
  type CertificateAuthorisedPayload,
  type DecisionRecordedPayload,
  type EvidenceCapturedPayload,
  type FacilityRegisteredPayload,
  type FacilityUpdatedPayload,
  type FindingClosedPayload,
  type FindingClosurePayload,
  type FindingEscalatedPayload,
  type FindingRaisedPayload,
  type FindingSeverity,
  type InspectionStartedPayload,
  type InspectionSubmittedPayload,
  type ResponseRecordedPayload,
  type ScoredCheckpoint,
} from "@agroassure/domain";
import { PgService } from "../db/pg.service";
import { evidenceObjectKey } from "../sync/object-key";

// Projections are derived read models. They carry no authority: if a projection
// disagrees with the event store, the event store wins and the projection is
// rebuilt by replaying from the beginning. Nothing here writes to event_store.

export const MAIN_PROJECTION = "main";

interface StoredEvent {
  event_id: string;
  aggregate_type: string;
  aggregate_id: string;
  seq: string;
  event_type: string;
  payload: unknown;
  actor_user_id: string | null;
  device_id: string | null;
  hlc: string;
  recorded_at: string;
}

@Injectable()
export class ProjectorService {
  private readonly logger = new Logger("Projector");

  constructor(private readonly pg: PgService) {}

  /**
   * Apply every event recorded after the cursor, in record order. Each event is
   * applied together with its cursor advance in one transaction, so a crash
   * replays at most the event it was working on and handlers stay idempotent.
   * Returns the number of events applied.
   */
  async applyPending(batchSize = 500): Promise<number> {
    let applied = 0;
    for (;;) {
      const batch = await this.nextBatch(batchSize);
      if (batch.length === 0) return applied;
      for (const e of batch) {
        await this.pg.transaction(async (client) => {
          await this.apply(client, e);
          await client.query(
            `INSERT INTO projection_cursor (projection_name, last_recorded_at, last_event_id)
             VALUES ($1, $2::timestamptz, $3)
             ON CONFLICT (projection_name) DO UPDATE
               SET last_recorded_at = EXCLUDED.last_recorded_at,
                   last_event_id    = EXCLUDED.last_event_id`,
            [MAIN_PROJECTION, e.recorded_at, e.event_id],
          );
        });
        applied += 1;
      }
      if (batch.length < batchSize) return applied;
    }
  }

  /** Drop every projected row and replay the whole store. Safe by design. */
  async rebuild(): Promise<number> {
    await this.pg.transaction(async (client) => {
      // Order respects foreign keys. Assignments are operational planning rows,
      // not projections, so their link to an inspection is cleared rather than
      // the rows deleted.
      await client.query(`UPDATE assignment SET inspection_id = NULL`);
      for (const t of [
        "certificate",
        "decision",
        "finding",
        "evidence",
        "checkpoint_response",
        "inspection",
        "facility",
      ]) {
        await client.query(`DELETE FROM ${t}`);
      }
      await client.query(`DELETE FROM projection_cursor WHERE projection_name = $1`, [
        MAIN_PROJECTION,
      ]);
    });
    return this.applyPending();
  }

  // projection_cursor holds one row per projection, keyed by name, so the
  // cursor is read with a LEFT JOIN rather than an aggregate. An earlier version
  // wrapped the columns in max(), which PostgreSQL has no uuid overload for.

  /** How far the projection lags the store, in events. Used by /health. */
  async lag(): Promise<number> {
    const rows = await this.pg.query<{ lag: string }>(
      `WITH c AS (
         SELECT coalesce(pc.last_recorded_at, '-infinity'::timestamptz) AS at,
                coalesce(pc.last_event_id, '00000000-0000-0000-0000-000000000000'::uuid) AS id
         FROM (SELECT 1) AS one
         LEFT JOIN projection_cursor pc ON pc.projection_name = $1
       )
       SELECT count(*)::text AS lag FROM event_store e, c
       WHERE (e.recorded_at, e.event_id) > (c.at, c.id)`,
      [MAIN_PROJECTION],
    );
    return Number(rows[0]?.lag ?? 0);
  }

  private async nextBatch(limit: number): Promise<StoredEvent[]> {
    return this.pg.query<StoredEvent>(
      `WITH c AS (
         SELECT coalesce(pc.last_recorded_at, '-infinity'::timestamptz) AS at,
                coalesce(pc.last_event_id, '00000000-0000-0000-0000-000000000000'::uuid) AS id
         FROM (SELECT 1) AS one
         LEFT JOIN projection_cursor pc ON pc.projection_name = $1
       )
       SELECT e.event_id, e.aggregate_type, e.aggregate_id, e.seq, e.event_type,
              e.payload, e.actor_user_id, e.device_id, e.hlc,
              to_char(e.recorded_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF') AS recorded_at
       FROM event_store e, c
       WHERE (e.recorded_at, e.event_id) > (c.at, c.id)
       ORDER BY e.recorded_at, e.event_id
       LIMIT $2`,
      [MAIN_PROJECTION, limit],
    );
  }

  private async apply(client: PoolClient, e: StoredEvent): Promise<void> {
    switch (e.event_type) {
      case "FacilityRegistered":
        return this.facilityRegistered(client, e);
      case "FacilityUpdated":
        return this.facilityUpdated(client, e);
      case "InspectionStarted":
        return this.inspectionStarted(client, e);
      case "ResponseRecorded":
        return this.responseRecorded(client, e);
      case "EvidenceCaptured":
        return this.evidenceCaptured(client, e);
      case "InspectionSubmitted":
        return this.inspectionSubmitted(client, e);
      case "FindingRaised":
        return this.findingRaised(client, e);
      case "FindingBecameOverdue":
        return this.findingBecameOverdue(client, e);
      case "FindingEscalated":
        return this.findingEscalated(client, e);
      case "FindingClosureSubmitted":
        return this.findingClosureSubmitted(client, e);
      case "FindingClosureRejected":
        return this.findingClosureRejected(client, e);
      case "FindingClosed":
        return this.findingClosed(client, e);
      case "DecisionRecorded":
        return this.decisionRecorded(client, e);
      case "CertificateAuthorised":
        return this.certificateAuthorised(client, e);
      case "CertificateRevoked":
        return this.certificateRevoked(client, e);
      default:
        // An unknown event type is data this projector does not yet understand.
        // It stays in the store, so a later handler can pick it up on rebuild.
        this.logger.warn(`no projection handler for ${e.event_type}`);
        return;
    }
  }

  // ---- facility -----------------------------------------------------------

  private async facilityRegistered(client: PoolClient, e: StoredEvent): Promise<void> {
    const p = e.payload as FacilityRegisteredPayload;
    await client.query(
      `INSERT INTO facility (id, jurisdiction_id, licence_number, facility_type, name,
                             owner_contact, address, lga, registered_point,
                             registered_accuracy_m, registered_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,
               CASE WHEN $9::float8 IS NULL THEN NULL
                    ELSE ST_SetSRID(ST_MakePoint($10::float8, $9::float8),4326)::geography END,
               $11, $12::timestamptz)
       ON CONFLICT (id) DO NOTHING`,
      [
        e.aggregate_id,
        p.jurisdictionId,
        p.licenceNumber,
        p.facilityType,
        p.name,
        JSON.stringify(p.ownerContact ?? {}),
        JSON.stringify(p.address ?? {}),
        p.lga ?? null,
        p.registeredPoint?.lat ?? null,
        p.registeredPoint?.lng ?? null,
        p.registeredPoint?.accuracyM ?? null,
        e.recorded_at,
      ],
    );
  }

  private async facilityUpdated(client: PoolClient, e: StoredEvent): Promise<void> {
    const p = e.payload as FacilityUpdatedPayload;
    // coalesce keeps every field the update did not mention.
    await client.query(
      `UPDATE facility SET
         licence_number = coalesce($2, licence_number),
         facility_type  = coalesce($3, facility_type),
         name           = coalesce($4, name),
         owner_contact  = coalesce($5::jsonb, owner_contact),
         address        = coalesce($6::jsonb, address),
         lga            = coalesce($7, lga),
         registered_point = CASE WHEN $8::float8 IS NULL THEN registered_point
              ELSE ST_SetSRID(ST_MakePoint($9::float8, $8::float8),4326)::geography END,
         registered_accuracy_m = coalesce($10, registered_accuracy_m)
       WHERE id = $1`,
      [
        e.aggregate_id,
        p.licenceNumber ?? null,
        p.facilityType ?? null,
        p.name ?? null,
        p.ownerContact ? JSON.stringify(p.ownerContact) : null,
        p.address ? JSON.stringify(p.address) : null,
        p.lga ?? null,
        p.registeredPoint?.lat ?? null,
        p.registeredPoint?.lng ?? null,
        p.registeredPoint?.accuracyM ?? null,
      ],
    );
  }

  // ---- inspection ---------------------------------------------------------

  private async inspectionStarted(client: PoolClient, e: StoredEvent): Promise<void> {
    const p = e.payload as InspectionStartedPayload;

    // A device may have worked a version superseded between download and visit.
    // The inspection is recorded against the version actually used, and the
    // difference is flagged for the supervisor rather than rejected.
    const version = await client.query<{ status: string }>(
      `SELECT status FROM instrument_version WHERE id = $1`,
      [p.instrumentVersionId],
    );
    const discrepancy = version.rows[0] !== undefined && version.rows[0].status !== "in_force";

    await client.query(
      `INSERT INTO inspection (id, reference, facility_id, instrument_version_id, structure_hash,
                               inspector_user_id, device_id, checkin_point, checkin_accuracy_m,
                               checkin_distance_m, checkin_flagged, version_discrepancy, status)
       VALUES ($1,$2,$3,$4,decode($5,'hex'),$6,$7,
               ST_SetSRID(ST_MakePoint($9::float8, $8::float8),4326)::geography,
               $10,$11,$12,$13,'in_progress')
       ON CONFLICT (id) DO NOTHING`,
      [
        e.aggregate_id,
        p.reference,
        p.facilityId,
        p.instrumentVersionId,
        p.structureHash,
        e.actor_user_id,
        e.device_id,
        p.checkin.point.lat,
        p.checkin.point.lng,
        p.checkin.point.accuracyM ?? null,
        p.checkin.distanceFromRegisteredM,
        p.checkin.flagged,
        discrepancy,
      ],
    );
  }

  private async responseRecorded(client: PoolClient, e: StoredEvent): Promise<void> {
    const p = e.payload as ResponseRecordedPayload;
    // The weight is read from the instrument version the inspection is bound to,
    // so the server scores with the regulator's weights, not the device's claim.
    await client.query(
      `INSERT INTO checkpoint_response
              (id, inspection_id, checkpoint_ref, response, remark, weight, recorded_hlc)
       SELECT $1, $2, $3, $4, $5, coalesce(cp.weight, 1), $6
       FROM inspection insp
       LEFT JOIN section s ON s.instrument_version_id = insp.instrument_version_id
                          AND s.ordinal = split_part($3, '.', 1)::int
       LEFT JOIN checkpoint cp ON cp.section_id = s.id
                          AND cp.ordinal = split_part($3, '.', 2)::int
       WHERE insp.id = $2
       ON CONFLICT (inspection_id, checkpoint_ref) DO NOTHING`,
      [e.event_id, e.aggregate_id, p.checkpointRef, p.response, p.remark ?? null, e.hlc],
    );
  }

  private async evidenceCaptured(client: PoolClient, e: StoredEvent): Promise<void> {
    const p = e.payload as EvidenceCapturedPayload;
    // The object key is derived from the content hash, so the row exists before
    // the bytes arrive; the upload flips `locked` once the store confirms WORM.
    await client.query(
      `INSERT INTO evidence (id, inspection_id, checkpoint_ref, sha256, object_key, mime,
                             captured_at, point, accuracy_m, locked)
       VALUES ($1,$2,$3,decode($4,'hex'),$5,$6,$7::timestamptz,
               ST_SetSRID(ST_MakePoint($9::float8, $8::float8),4326)::geography,$10,false)
       ON CONFLICT (inspection_id, sha256) DO NOTHING`,
      [
        p.evidenceId,
        e.aggregate_id,
        p.checkpointRef,
        p.sha256,
        evidenceObjectKey(p.sha256),
        p.mime,
        p.capturedAt,
        p.point.lat,
        p.point.lng,
        p.point.accuracyM ?? null,
      ],
    );
  }

  private async inspectionSubmitted(client: PoolClient, e: StoredEvent): Promise<void> {
    const p = e.payload as InspectionSubmittedPayload;
    const rating = await this.recomputeRating(client, e.aggregate_id);

    if (rating && Math.abs(rating.ratingPercent - p.ratingPercent) > 0.01) {
      // Never a rejection: the record stands exactly as authored. The server's
      // own recomputation is what the projection publishes, and the difference
      // is surfaced rather than silently resolved.
      this.logger.warn(
        `inspection ${e.aggregate_id}: device reported ${p.ratingPercent}%, ` +
          `server recomputed ${rating.ratingPercent}%`,
      );
    }

    await client.query(
      `UPDATE inspection SET
         status              = 'submitted',
         rating_percent      = $2,
         rating_band         = $3,
         findings_count      = (SELECT count(*) FROM finding WHERE inspection_id = $1),
         inspector_signed_at = $4::timestamptz,
         facility_signed_at  = $5::timestamptz,
         facility_rep_name   = $6,
         submitted_at        = $7::timestamptz
       WHERE id = $1`,
      [
        e.aggregate_id,
        rating?.ratingPercent ?? p.ratingPercent,
        rating?.band ?? p.ratingBand,
        p.inspector.signedAt,
        p.facilityRep.signedAt,
        p.facilityRep.name,
        e.recorded_at,
      ],
    );

    await client.query(
      `UPDATE assignment SET status = 'completed'
       WHERE inspection_id = $1 AND status <> 'completed'`,
      [e.aggregate_id],
    );
  }

  /** Recompute the rating from stored responses and the bound version's bands. */
  private async recomputeRating(client: PoolClient, inspectionId: string) {
    const bands = await client.query<{ satisfactory_min: string; needs_improve_min: string }>(
      `SELECT iv.satisfactory_min, iv.needs_improve_min
       FROM inspection i JOIN instrument_version iv ON iv.id = i.instrument_version_id
       WHERE i.id = $1`,
      [inspectionId],
    );
    const b = bands.rows[0];
    if (!b) return null;

    const responses = await client.query<{ response: string; weight: number }>(
      `SELECT response, weight FROM checkpoint_response WHERE inspection_id = $1`,
      [inspectionId],
    );
    const findings = await client.query<{ severity: string; status: string }>(
      `SELECT severity, status FROM finding WHERE inspection_id = $1`,
      [inspectionId],
    );

    return scoreInspection(
      responses.rows as ScoredCheckpoint[],
      findings.rows.map((f) => ({
        severity: f.severity as FindingSeverity,
        open: f.status !== "closed",
      })),
      {
        satisfactoryMin: Number(b.satisfactory_min),
        needsImprovementMin: Number(b.needs_improve_min),
      },
    );
  }

  // ---- finding ------------------------------------------------------------

  private async findingRaised(client: PoolClient, e: StoredEvent): Promise<void> {
    const p = e.payload as FindingRaisedPayload;
    const due =
      p.dueDate ??
      dueDateFor(p.severity, new Date(e.recorded_at), DEFAULT_SLA).toISOString().slice(0, 10);

    await client.query(
      `INSERT INTO finding (id, reference, inspection_id, checkpoint_response_id, checkpoint_ref,
                            summary, severity, owner_user_id, owner_label, due_date, status)
       SELECT $1, $2, $3,
              (SELECT id FROM checkpoint_response
                WHERE inspection_id = $3 AND checkpoint_ref = $4),
              $4, $5, $6, $7, $8, $9::date, 'open'
       ON CONFLICT (id) DO NOTHING`,
      [
        e.aggregate_id,
        p.reference,
        p.inspectionId,
        p.checkpointRef,
        p.summary,
        p.severity,
        p.ownerUserId ?? null,
        p.ownerLabel ?? null,
        due,
      ],
    );

    await client.query(
      `UPDATE inspection
          SET findings_count = (SELECT count(*) FROM finding WHERE inspection_id = $1)
        WHERE id = $1`,
      [p.inspectionId],
    );
  }

  private async findingBecameOverdue(client: PoolClient, e: StoredEvent): Promise<void> {
    await client.query(
      `UPDATE finding SET status = 'overdue' WHERE id = $1 AND status = 'open'`,
      [e.aggregate_id],
    );
  }

  private async findingEscalated(client: PoolClient, e: StoredEvent): Promise<void> {
    const p = e.payload as FindingEscalatedPayload;
    await client.query(
      `UPDATE finding SET status = 'escalated', escalated_to = $2, escalated_at = $3::timestamptz
       WHERE id = $1 AND status IN ('open','overdue')`,
      [e.aggregate_id, p.to, p.at],
    );
  }

  private async findingClosureSubmitted(client: PoolClient, e: StoredEvent): Promise<void> {
    const p = e.payload as FindingClosurePayload;
    await client.query(
      `UPDATE finding SET status = 'awaiting_verification', closure_submitted_at = $2::timestamptz
       WHERE id = $1 AND status IN ('open','overdue','escalated')`,
      [e.aggregate_id, p.at],
    );
  }

  private async findingClosureRejected(client: PoolClient, e: StoredEvent): Promise<void> {
    // Rejected verification returns the finding to open and keeps it tracked;
    // the rejection itself stays in the store as the reason it reopened.
    await client.query(
      `UPDATE finding SET status = 'open', closure_submitted_at = NULL
       WHERE id = $1 AND status = 'awaiting_verification'`,
      [e.aggregate_id],
    );
  }

  private async findingClosed(client: PoolClient, e: StoredEvent): Promise<void> {
    const p = e.payload as FindingClosedPayload;
    await client.query(
      `UPDATE finding SET status = 'closed', closed_at = $2::timestamptz, closed_by_user_id = $3
       WHERE id = $1 AND status = 'awaiting_verification'`,
      [e.aggregate_id, p.at, p.verifiedByUserId],
    );
  }

  // ---- decision & certificate --------------------------------------------

  private async decisionRecorded(client: PoolClient, e: StoredEvent): Promise<void> {
    const p = e.payload as DecisionRecordedPayload;
    await client.query(
      `INSERT INTO decision (id, inspection_id, officer_id, decision_type, basis, decided_at)
       VALUES ($1,$2,$3,$4,$5,$6::timestamptz)
       ON CONFLICT (id) DO NOTHING`,
      [p.decisionId, p.inspectionId, p.officerId, p.decisionType, p.basis ?? null, p.decidedAt],
    );
  }

  private async certificateAuthorised(client: PoolClient, e: StoredEvent): Promise<void> {
    const p = e.payload as CertificateAuthorisedPayload;
    // Every NOT NULL column below is an invariant in the schema: no decision and
    // no named officer means no schema-valid row, so no code path can produce a
    // certificate the platform issued on its own authority.
    await client.query(
      `INSERT INTO certificate (id, serial, facility_id, inspection_id, decision_id,
                                authorising_officer_id, issuing_authority_id,
                                rating_band, rating_percent, issued_on, valid_to,
                                next_due_on, status, verification_token)
       SELECT $1, $2, $3, $4, $5, $6,
              (SELECT a.id FROM issuing_authority a
                 JOIN facility f ON f.jurisdiction_id = a.jurisdiction_id
                WHERE f.id = $3 ORDER BY a.created_at LIMIT 1),
              i.rating_band, i.rating_percent, $7::date, $8::date, $9::date, 'valid', $10
       FROM inspection i WHERE i.id = $4
       ON CONFLICT (id) DO NOTHING`,
      [
        e.aggregate_id,
        p.serial,
        p.facilityId,
        p.inspectionId,
        p.decisionId,
        p.authorisingOfficerId,
        p.issuedOn,
        p.validTo,
        p.nextDueOn,
        p.verificationToken,
      ],
    );
  }

  private async certificateRevoked(client: PoolClient, e: StoredEvent): Promise<void> {
    // Revocation never deletes: the history stays intact and the public page
    // simply stops confirming the certificate.
    await client.query(`UPDATE certificate SET status = 'revoked' WHERE id = $1`, [
      e.aggregate_id,
    ]);
  }
}
