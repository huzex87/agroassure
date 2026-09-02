import { ForbiddenException, Injectable } from "@nestjs/common";
import { PgService } from "../db/pg.service";
import type { Principal } from "../common/principal";
import { isUnscoped, jurisdictionFilter } from "../common/rbac";

// The exports an NDPA compliance posture needs.
//
// The event store is already the audit log: every state change is an attributed,
// timestamped, immutable event. These exports derive from it rather than from a
// separate log that could be tidied before an audit, which is the whole reason
// they can be trusted.
//
// The deploying institution is the data controller and Disbursify Technologies
// the processor. The lawful basis for processing inspector and facility
// representative data is the regulator's legal obligation and public task under
// the National Fertilizer Quality Control Act 2019, not consent — which is why
// an inspection is never gated on a consent dialog.

export interface ProcessingActivity {
  activity: string;
  purpose: string;
  lawfulBasis: string;
  dataSubjects: string;
  categories: string;
  retention: string;
  recipients: string;
  residency: string;
}

/**
 * The Record of Processing Activities. It is a description of the system rather
 * than a query of it, so it lives here beside the code it describes: a new
 * category of personal data should be impossible to add without this changing.
 */
export const PROCESSING_ACTIVITIES: ProcessingActivity[] = [
  {
    activity: "Statutory inspection of regulated facilities",
    purpose:
      "Recording the conduct and outcome of quality-control inspections under the National Fertilizer Quality Control Act 2019.",
    lawfulBasis: "Legal obligation and public task of the mandated regulator",
    dataSubjects: "Inspectors, facility representatives, facility owners and contacts",
    categories:
      "Name, role, employer, signature timestamp, device identifier, location at check-in, photographs of premises",
    retention:
      "Retained for the statutory record-keeping period set by the deploying institution; evidence objects are held under object-lock for that period and cannot be deleted early.",
    recipients:
      "The deploying institution. No transfer to a third party and no transfer outside Nigeria.",
    residency: "Nigeria",
  },
  {
    activity: "Corrective-action tracking",
    purpose: "Tracking findings to closure and escalating those that pass their due date.",
    lawfulBasis: "Legal obligation and public task of the mandated regulator",
    dataSubjects: "Facility representatives, inspectors, supervising officers",
    categories: "Name, role, assignment, closure evidence and the time it was submitted",
    retention: "As for the inspection the finding belongs to.",
    recipients: "The deploying institution.",
    residency: "Nigeria",
  },
  {
    activity: "Certificate authorisation and rendering",
    purpose:
      "Recording the officer decision that authorises a certificate, and rendering that certificate on the regulator's behalf.",
    lawfulBasis: "Legal obligation and public task of the mandated regulator",
    dataSubjects: "Authorising officers, facility owners",
    categories: "Officer name and role, business identity, licence number, rating",
    retention: "For the life of the certificate record, which is never deleted.",
    recipients: "The deploying institution; the certificate holder.",
    residency: "Nigeria",
  },
  {
    activity: "Public verification",
    purpose:
      "Allowing a buyer to confirm that a business holds a current certificate of compliance.",
    lawfulBasis: "Public task; publication of a positive regulatory record only",
    dataSubjects: "Regulated businesses. Nothing is collected from the enquirer.",
    categories:
      "Business name, licence number, facility type, LGA, date of last inspection, rating, validity date. No adverse data is reachable from this surface.",
    retention: "Shown only while a certificate is currently valid.",
    recipients: "The public.",
    residency: "Nigeria",
  },
];

@Injectable()
export class AuditService {
  constructor(private readonly pg: PgService) {}

  /**
   * Everything the platform holds about one named person, wherever it sits.
   * This is what answers a data subject access request, and it reads the event
   * store as well as the projections, because an event the projections no longer
   * surface is still personal data the platform holds.
   */
  async subjectAccessExport(principal: Principal, userId: string) {
    if (!isUnscoped(principal) && !principal.roles.includes("state_admin")) {
      throw new ForbiddenException("a subject access export requires an administrator or auditor");
    }

    const [user] = await this.pg.query(
      `SELECT id, full_name, email, phone, oidc_subject, status, jurisdiction_id, created_at
       FROM app_user WHERE id = $1 AND ($2::uuid IS NULL OR jurisdiction_id = $2)`,
      [userId, jurisdictionFilter(principal)],
    );
    if (!user) throw new ForbiddenException("no such user in your jurisdiction");

    const roles = await this.pg.query(
      `SELECT role_code, jurisdiction_id FROM user_role WHERE user_id = $1`,
      [userId],
    );
    const devices = await this.pg.query(
      `SELECT id, label, status, enrolled_at, revoked_at FROM device WHERE assigned_user_id = $1`,
      [userId],
    );
    const inspections = await this.pg.query(
      `SELECT id, reference, submitted_at, rating_percent, rating_band,
              ST_Y(checkin_point::geometry) AS checkin_lat,
              ST_X(checkin_point::geometry) AS checkin_lng
       FROM inspection WHERE inspector_user_id = $1`,
      [userId],
    );
    const decisions = await this.pg.query(
      `SELECT id, inspection_id, decision_type, basis, decided_at
       FROM decision WHERE officer_id = $1`,
      [userId],
    );
    const certificates = await this.pg.query(
      `SELECT id, serial, issued_on FROM certificate WHERE authorising_officer_id = $1`,
      [userId],
    );
    const findings = await this.pg.query(
      `SELECT id, reference, status, closed_at FROM finding
       WHERE owner_user_id = $1 OR closed_by_user_id = $1`,
      [userId],
    );
    const events = await this.pg.query(
      `SELECT event_id, aggregate_type, aggregate_id, event_type, recorded_at
       FROM event_store WHERE actor_user_id = $1 ORDER BY recorded_at`,
      [userId],
    );

    return {
      generatedAt: new Date().toISOString(),
      subject: user,
      roles,
      devices,
      inspectionsConducted: inspections,
      decisionsMade: decisions,
      certificatesAuthorised: certificates,
      findingsOwnedOrClosed: findings,
      // The signatures of facility representatives live inside inspection
      // payloads rather than in a table of their own, so a representative's
      // export is assembled from events instead.
      eventsAuthored: events,
      note:
        "Personal data held about this person across the platform. The event store is included " +
        "because an event is a record even where no projection currently surfaces it.",
    };
  }

  /** A facility representative is named in events, not in a user table. */
  async representativeExport(principal: Principal, name: string) {
    if (!isUnscoped(principal) && !principal.roles.includes("state_admin")) {
      throw new ForbiddenException("a subject access export requires an administrator or auditor");
    }
    const inspections = await this.pg.query(
      `SELECT i.id, i.reference, i.facility_rep_name, i.facility_signed_at, i.submitted_at,
              f.name AS facility_name
       FROM inspection i
       JOIN facility f ON f.id = i.facility_id
       WHERE i.facility_rep_name ILIKE $1
         AND ($2::uuid IS NULL OR f.jurisdiction_id = $2)
       ORDER BY i.submitted_at`,
      [name, jurisdictionFilter(principal)],
    );
    return { generatedAt: new Date().toISOString(), name, inspections };
  }

  /**
   * What was processed in a period, and by whom. This is the log an NDPC
   * compliance audit asks for, and it is a projection of the event store rather
   * than an application log, so it cannot have been edited before the audit.
   */
  async processingLog(principal: Principal, from: string, to: string) {
    if (!isUnscoped(principal) && !principal.roles.includes("state_admin")) {
      throw new ForbiddenException("a processing log requires an administrator or auditor");
    }

    const byActivity = await this.pg.query(
      `SELECT e.event_type, count(*)::int AS events,
              count(DISTINCT e.actor_user_id)::int AS actors,
              count(DISTINCT e.device_id)::int AS devices,
              min(e.recorded_at) AS first_at, max(e.recorded_at) AS last_at
       FROM event_store e
       WHERE e.recorded_at >= $1::timestamptz AND e.recorded_at < ($2::date + 1)
       GROUP BY e.event_type
       ORDER BY events DESC`,
      [from, to],
    );

    const byActor = await this.pg.query(
      `SELECT u.full_name, count(*)::int AS events,
              min(e.recorded_at) AS first_at, max(e.recorded_at) AS last_at
       FROM event_store e
       JOIN app_user u ON u.id = e.actor_user_id
       WHERE e.recorded_at >= $1::timestamptz AND e.recorded_at < ($2::date + 1)
         AND ($3::uuid IS NULL OR u.jurisdiction_id = $3)
       GROUP BY u.id, u.full_name
       ORDER BY events DESC`,
      [from, to, jurisdictionFilter(principal)],
    );

    return {
      generatedAt: new Date().toISOString(),
      period: { from, to },
      residency: "Nigeria: no personal data is processed outside the country.",
      byActivity,
      byActor,
    };
  }

  /** The Record of Processing Activities, with live counts against each entry. */
  async recordOfProcessing(principal: Principal) {
    const [counts] = await this.pg.query<Record<string, string>>(
      `SELECT
         (SELECT count(*) FROM app_user WHERE ($1::uuid IS NULL OR jurisdiction_id = $1))::text
           AS users,
         (SELECT count(*) FROM device WHERE ($1::uuid IS NULL OR jurisdiction_id = $1))::text
           AS devices,
         (SELECT count(*) FROM inspection i JOIN facility f ON f.id = i.facility_id
           WHERE ($1::uuid IS NULL OR f.jurisdiction_id = $1))::text AS inspections,
         (SELECT count(*) FROM evidence)::text AS evidence_objects,
         (SELECT count(*) FROM event_store)::text AS events`,
      [jurisdictionFilter(principal)],
    );

    return {
      generatedAt: new Date().toISOString(),
      controller: "The deploying institution (mandated regulator)",
      processor: "Disbursify Technologies Limited",
      residency: "Nigeria",
      transfersOutsideNigeria: "None.",
      activities: PROCESSING_ACTIVITIES,
      volumes: {
        users: Number(counts?.users ?? 0),
        devices: Number(counts?.devices ?? 0),
        inspections: Number(counts?.inspections ?? 0),
        evidenceObjects: Number(counts?.evidence_objects ?? 0),
        events: Number(counts?.events ?? 0),
      },
    };
  }
}
