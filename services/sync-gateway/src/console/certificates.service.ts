import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "@noble/hashes/utils";
import {
  mintSerial,
  mintVerificationToken,
  ratingSupportsIssuance,
  uuidv7,
  type CertificateAuthorisedPayload,
  type RatingBand,
} from "@agroassure/domain";
import { PgService } from "../db/pg.service";
import { EventAppender } from "../events/event-appender.service";
import type { Principal } from "../common/principal";
import { jurisdictionFilter } from "../common/rbac";

// A certificate is recorded and rendered on behalf of the mandated regulator.
// The platform never issues one on its own authority, and that is not a policy
// the code tries to follow: there is no endpoint that takes a facility and a
// rating, the only command is AuthoriseCertificate, and the schema refuses a row
// without both a decision and a named authorising officer.

const VALIDITY_MONTHS = 12;
const NEXT_DUE_MONTHS = 6;

interface DecisionRow {
  decision_id: string;
  officer_id: string;
  facility_id: string;
  jurisdiction_id: string;
  jurisdiction_code: string;
  licence_number: string;
  rating_band: RatingBand | null;
  open_findings: string;
}

@Injectable()
export class CertificatesService {
  constructor(
    private readonly pg: PgService,
    private readonly events: EventAppender,
  ) {}

  /**
   * Authorise a certificate for a completed inspection. Every check below is a
   * reason the platform can refuse; none of them can be waived by a client.
   */
  async authorise(principal: Principal, inspectionId: string): Promise<{
    certificateId: string;
    serial: string;
  }> {
    const rows = await this.pg.query<DecisionRow>(
      `SELECT d.id AS decision_id, d.officer_id,
              i.facility_id, f.jurisdiction_id, j.code AS jurisdiction_code,
              f.licence_number, i.rating_band,
              (SELECT count(*) FROM finding fd
                WHERE fd.inspection_id = i.id AND fd.status <> 'closed')::text AS open_findings
       FROM inspection i
       JOIN facility f     ON f.id = i.facility_id
       JOIN jurisdiction j ON j.id = f.jurisdiction_id
       LEFT JOIN LATERAL (
         SELECT d.id, d.officer_id FROM decision d
         WHERE d.inspection_id = i.id AND d.decision_type = 'authorise_certificate'
         ORDER BY d.decided_at DESC LIMIT 1
       ) d ON true
       WHERE i.id = $1 AND i.status = 'submitted'`,
      [inspectionId],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException("submitted inspection");

    const scope = jurisdictionFilter(principal);
    if (scope !== null && scope !== row.jurisdiction_id) {
      throw new ForbiddenException("inspection is outside your jurisdiction");
    }

    // The invariant, checked in the order that gives the clearest refusal.
    if (!row.decision_id) {
      throw new ConflictException("no authorising decision on record for this inspection");
    }
    if (row.officer_id !== principal.userId) {
      throw new ForbiddenException("only the deciding officer may authorise the certificate");
    }
    if (Number(row.open_findings) > 0) {
      throw new ConflictException(`${row.open_findings} finding(s) remain open`);
    }
    if (!row.rating_band || !ratingSupportsIssuance(row.rating_band)) {
      throw new ConflictException(
        `rating ${row.rating_band ?? "unrated"} does not support issuance`,
      );
    }

    const existing = await this.pg.query(
      `SELECT 1 FROM certificate WHERE inspection_id = $1 AND status = 'valid'`,
      [inspectionId],
    );
    if (existing.length > 0) {
      throw new ConflictException("a valid certificate already exists for this inspection");
    }

    const issuedOn = new Date();
    const serial = await this.uniqueSerial(
      row.jurisdiction_code,
      row.licence_number,
      issuedOn,
    );
    const certificateId = uuidv7();

    const payload: CertificateAuthorisedPayload = {
      facilityId: row.facility_id,
      inspectionId,
      decisionId: row.decision_id,
      authorisingOfficerId: principal.userId,
      serial,
      verificationToken: mintVerificationToken(randomBytes),
      issuedOn: isoDate(issuedOn),
      validTo: isoDate(addMonths(issuedOn, VALIDITY_MONTHS, -1)),
      nextDueOn: isoDate(addMonths(issuedOn, NEXT_DUE_MONTHS, 0)),
    };

    await this.events.append({
      aggregateType: "certificate",
      aggregateId: certificateId,
      eventType: "CertificateAuthorised",
      payload,
      actorUserId: principal.userId,
    });

    return { certificateId, serial };
  }

  /** Revocation is a new state event; the certificate row is never deleted. */
  async revoke(principal: Principal, certificateId: string, reason: string): Promise<void> {
    const cert = await this.byId(principal, certificateId);
    if (cert.status !== "valid") {
      throw new ConflictException(`certificate is already ${cert.status}`);
    }
    await this.events.append({
      aggregateType: "certificate",
      aggregateId: certificateId,
      eventType: "CertificateRevoked",
      payload: {
        at: new Date().toISOString(),
        revokedByUserId: principal.userId,
        reason,
      },
      actorUserId: principal.userId,
    });
  }

  async byId(principal: Principal, certificateId: string) {
    const rows = await this.pg.query<Record<string, unknown> & { status: string }>(
      `SELECT c.*, f.name AS business_name, f.licence_number, f.facility_type, f.lga,
              f.jurisdiction_id,
              i.reference AS inspection_reference, i.submitted_at AS last_inspected,
              u.full_name AS authorising_officer_name,
              a.display_name AS issuing_authority, a.legal_name AS issuing_authority_legal,
              a.mark_asset_url
       FROM certificate c
       JOIN facility f          ON f.id = c.facility_id
       JOIN inspection i        ON i.id = c.inspection_id
       JOIN app_user u          ON u.id = c.authorising_officer_id
       JOIN issuing_authority a ON a.id = c.issuing_authority_id
       WHERE c.id = $1 AND ($2::uuid IS NULL OR f.jurisdiction_id = $2)`,
      [certificateId, jurisdictionFilter(principal)],
    );
    const cert = rows[0];
    if (!cert) throw new NotFoundException("certificate");
    return cert;
  }

  async recordRender(certificateId: string, objectKey: string): Promise<void> {
    await this.pg.query(
      `UPDATE certificate SET pdf_object_key = $2, rendered_at = now() WHERE id = $1`,
      [certificateId, objectKey],
    );
  }

  /**
   * The printed serial is short and human-readable, so two certificates for the
   * same licence in the same month would collide. That is rare; when it happens
   * a discriminator is appended rather than the format being made unreadable.
   */
  private async uniqueSerial(
    jurisdictionCode: string,
    licenceNumber: string,
    issuedOn: Date,
  ): Promise<string> {
    const base = mintSerial(jurisdictionCode, licenceNumber, issuedOn);
    for (let i = 0; i < 26; i++) {
      const candidate = i === 0 ? base : `${base}-${String.fromCharCode(65 + i)}`;
      const taken = await this.pg.query(`SELECT 1 FROM certificate WHERE serial = $1`, [
        candidate,
      ]);
      if (taken.length === 0) return candidate;
    }
    throw new ConflictException("could not mint a unique certificate serial");
  }
}

function addMonths(d: Date, months: number, days: number): Date {
  const out = new Date(d);
  out.setUTCMonth(out.getUTCMonth() + months);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
