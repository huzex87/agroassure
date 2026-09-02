import { Injectable, NotFoundException } from "@nestjs/common";
import { uuidv7, type FacilityRegisteredPayload, type GeoPoint } from "@agroassure/domain";
import { PgService } from "../db/pg.service";
import { EventAppender } from "../events/event-appender.service";
import type { Principal } from "../common/principal";
import { jurisdictionFilter } from "../common/rbac";

// The facility registry is console-owned and edited online by a single writer,
// so it never takes offline edits and never diverges. Every edit is an event;
// the `facility` table is the projection of those events.

export interface RegisterFacilityInput {
  licenceNumber: string;
  facilityType: FacilityRegisteredPayload["facilityType"];
  name: string;
  ownerContact?: Record<string, unknown>;
  address?: Record<string, unknown>;
  lga?: string;
  registeredPoint?: GeoPoint;
}

export interface FacilityFilter {
  facilityType?: string;
  lga?: string;
  certificateStatus?: "valid" | "due_soon" | "overdue" | "never_inspected";
  q?: string;
}

@Injectable()
export class RegistryService {
  constructor(
    private readonly pg: PgService,
    private readonly events: EventAppender,
  ) {}

  async register(principal: Principal, input: RegisterFacilityInput): Promise<string> {
    const facilityId = uuidv7();
    const payload: FacilityRegisteredPayload = {
      // A registry editor always writes inside their own jurisdiction.
      jurisdictionId: principal.jurisdictionId ?? "",
      ...input,
    };
    if (!payload.jurisdictionId) {
      throw new NotFoundException("principal has no jurisdiction to register into");
    }
    await this.events.append({
      aggregateType: "facility",
      aggregateId: facilityId,
      eventType: "FacilityRegistered",
      payload,
      actorUserId: principal.userId,
    });
    return facilityId;
  }

  async update(
    principal: Principal,
    facilityId: string,
    patch: Partial<RegisterFacilityInput>,
  ): Promise<void> {
    await this.byId(principal, facilityId); // 404 and jurisdiction scope
    await this.events.append({
      aggregateType: "facility",
      aggregateId: facilityId,
      eventType: "FacilityUpdated",
      payload: patch,
      actorUserId: principal.userId,
    });
  }

  /**
   * The registry list behind the map and the facilities screen. Certificate
   * status is derived here rather than stored, so it is never stale: a
   * certificate that lapsed overnight reads as overdue the next morning with no
   * job having to touch the row.
   */
  async list(principal: Principal, filter: FacilityFilter) {
    return this.pg.query(
      `SELECT f.id, f.licence_number, f.facility_type, f.name, f.lga, f.address,
              f.owner_contact,
              ST_Y(f.registered_point::geometry) AS lat,
              ST_X(f.registered_point::geometry) AS lng,
              last_i.submitted_at AS last_inspected,
              last_i.rating_band  AS last_rating_band,
              c.serial            AS certificate_serial,
              c.valid_to          AS certificate_valid_to,
              CASE
                WHEN c.id IS NULL AND last_i.id IS NULL THEN 'never_inspected'
                WHEN c.id IS NULL                        THEN 'overdue'
                WHEN c.valid_to <  current_date          THEN 'overdue'
                WHEN c.valid_to <= current_date + 30     THEN 'due_soon'
                ELSE 'valid'
              END AS certificate_status
       FROM facility f
       LEFT JOIN LATERAL (
         SELECT i.id, i.submitted_at, i.rating_band FROM inspection i
         WHERE i.facility_id = f.id AND i.status = 'submitted'
         ORDER BY i.submitted_at DESC LIMIT 1
       ) last_i ON true
       LEFT JOIN LATERAL (
         SELECT c.id, c.serial, c.valid_to FROM certificate c
         WHERE c.facility_id = f.id AND c.status = 'valid'
         ORDER BY c.valid_to DESC LIMIT 1
       ) c ON true
       WHERE ($1::uuid IS NULL OR f.jurisdiction_id = $1)
         AND ($2::text IS NULL OR f.facility_type = $2)
         AND ($3::text IS NULL OR f.lga = $3)
         AND ($4::text IS NULL OR f.name ILIKE '%' || $4 || '%'
                               OR f.licence_number ILIKE '%' || $4 || '%')
       ORDER BY f.name
       LIMIT 500`,
      [
        jurisdictionFilter(principal),
        filter.facilityType ?? null,
        filter.lga ?? null,
        filter.q ?? null,
      ],
    );
  }

  async byId(principal: Principal, facilityId: string) {
    const rows = await this.pg.query(
      `SELECT f.*,
              ST_Y(f.registered_point::geometry) AS lat,
              ST_X(f.registered_point::geometry) AS lng
       FROM facility f
       WHERE f.id = $1 AND ($2::uuid IS NULL OR f.jurisdiction_id = $2)`,
      [facilityId, jurisdictionFilter(principal)],
    );
    const facility = rows[0];
    if (!facility) throw new NotFoundException("facility");

    const history = await this.pg.query(
      `SELECT i.id, i.reference, i.submitted_at, i.rating_percent, i.rating_band,
              i.findings_count, i.checkin_flagged, u.full_name AS inspector
       FROM inspection i
       JOIN app_user u ON u.id = i.inspector_user_id
       WHERE i.facility_id = $1
       ORDER BY i.created_at DESC
       LIMIT 50`,
      [facilityId],
    );

    const certificates = await this.pg.query(
      `SELECT id, serial, rating_band, issued_on, valid_to, next_due_on, status
       FROM certificate WHERE facility_id = $1 ORDER BY issued_on DESC`,
      [facilityId],
    );

    return { facility, inspections: history, certificates };
  }
}
