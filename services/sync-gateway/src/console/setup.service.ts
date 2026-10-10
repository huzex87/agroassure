import { Injectable } from "@nestjs/common";
import { PgService } from "../db/pg.service";
import type { Principal } from "../common/principal";
import { jurisdictionFilter } from "../common/rbac";

// How far a state has got with setting itself up, and who is asking.
//
// A new client's first sight of the console used to be a dashboard of zeros
// with nothing saying what to do about them. The console now shows a short
// checklist instead, and this is what it is ticked from: each step is done
// when the record says so, not when someone clicks "mark as done".

export interface SetupProgress {
  facilities: number;
  /** Facility types with a checklist in force, out of the four the Act names. */
  checklistsInForce: number;
  inspectors: number;
  inspectorsWithPhone: number;
  invitesWaiting: number;
  plannedVisits: number;
  submittedInspections: number;
}

export interface Me {
  userId: string;
  fullName: string;
  email: string | null;
  roles: string[];
  jurisdictionId: string | null;
  jurisdictionName: string | null;
  /**
   * The authority the certificates are rendered for, so the console can say whose
   * programme this is. A regulator's staff expect their own name on their tool.
   */
  authority: { name: string; markUrl: string | null } | null;
}

@Injectable()
export class SetupService {
  constructor(private readonly pg: PgService) {}

  async progress(principal: Principal): Promise<SetupProgress> {
    const [row] = await this.pg.query<Record<keyof SetupProgress, string>>(
      `SELECT
         (SELECT count(*) FROM facility f
           WHERE ($1::uuid IS NULL OR f.jurisdiction_id = $1)) AS facilities,
         (SELECT count(DISTINCT i.facility_type) FROM instrument i
            JOIN instrument_version v ON v.instrument_id = i.id AND v.status = 'in_force'
           WHERE ($1::uuid IS NULL OR i.jurisdiction_id = $1)) AS "checklistsInForce",
         (SELECT count(DISTINCT u.id) FROM app_user u
            JOIN user_role r ON r.user_id = u.id AND r.role_code = 'inspector'
           WHERE u.status = 'active' AND ($1::uuid IS NULL OR u.jurisdiction_id = $1)) AS inspectors,
         (SELECT count(DISTINCT d.assigned_user_id) FROM device d
            JOIN user_role r ON r.user_id = d.assigned_user_id AND r.role_code = 'inspector'
           WHERE d.status = 'active' AND ($1::uuid IS NULL OR d.jurisdiction_id = $1)) AS "inspectorsWithPhone",
         (SELECT count(*) FROM invitation i
           WHERE i.used_at IS NULL AND i.cancelled_at IS NULL AND i.expires_at > now()
             AND ($1::uuid IS NULL OR i.jurisdiction_id = $1)) AS "invitesWaiting",
         (SELECT count(*) FROM assignment a
           WHERE a.status IN ('planned', 'in_progress')
             AND ($1::uuid IS NULL OR a.jurisdiction_id = $1)) AS "plannedVisits",
         (SELECT count(*) FROM inspection s JOIN facility f ON f.id = s.facility_id
           WHERE s.status = 'submitted'
             AND ($1::uuid IS NULL OR f.jurisdiction_id = $1)) AS "submittedInspections"`,
      [jurisdictionFilter(principal)],
    );
    return {
      facilities: Number(row?.facilities ?? 0),
      checklistsInForce: Number(row?.checklistsInForce ?? 0),
      inspectors: Number(row?.inspectors ?? 0),
      inspectorsWithPhone: Number(row?.inspectorsWithPhone ?? 0),
      invitesWaiting: Number(row?.invitesWaiting ?? 0),
      plannedVisits: Number(row?.plannedVisits ?? 0),
      submittedInspections: Number(row?.submittedInspections ?? 0),
    };
  }

  /**
   * The signed-in person, as this platform holds them. Roles are the verified
   * principal's — the ones every request is actually authorised by — so the
   * console can hide what someone cannot use without ever deciding what they
   * may do; the gateway still decides that on every request.
   */
  async me(principal: Principal): Promise<Me> {
    const [row] = await this.pg.query<{
      full_name: string;
      email: string | null;
      jurisdiction_name: string | null;
      authority_name: string | null;
      authority_mark: string | null;
    }>(
      `SELECT u.full_name, u.email, j.name AS jurisdiction_name,
              a.display_name AS authority_name, a.mark_asset_url AS authority_mark
         FROM app_user u
         LEFT JOIN jurisdiction j ON j.id = $2
         LEFT JOIN LATERAL (
              SELECT display_name, mark_asset_url FROM issuing_authority
               WHERE jurisdiction_id = $2 ORDER BY created_at LIMIT 1
         ) a ON true
        WHERE u.id = $1`,
      [principal.userId, principal.jurisdictionId],
    );
    return {
      userId: principal.userId,
      fullName: row?.full_name ?? "",
      email: row?.email ?? null,
      roles: principal.roles,
      jurisdictionId: principal.jurisdictionId,
      jurisdictionName: row?.jurisdiction_name ?? null,
      authority: row?.authority_name
        ? {
            name: row.authority_name,
            // Only a secure address is ever handed to a browser to load.
            markUrl: row.authority_mark?.startsWith("https://") ? row.authority_mark : null,
          }
        : null,
    };
  }
}
