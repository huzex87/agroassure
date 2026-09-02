import { Inject, Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Pool } from "pg";
import { CONFIG, type AppConfig } from "../config/config";

// The public verification surface returns one of exactly two answers, and it
// reads one view to do it.
//
// The boundary is architectural rather than a query convention someone has to
// remember: this module holds its own connection pool, that pool logs in as a
// role granted SELECT on public_certificate_view and nothing else, and the view
// physically contains no findings, remarks, decisions, or evidence. A careless
// join here cannot leak adverse data, because the adverse data is not in any
// table this connection can reach.

export const NO_RECORD_MESSAGE =
  "No current certificate is on record for this search. This does not indicate a " +
  "compliance failure. Contact the relevant agro-input desk to confirm status.";

export interface VerifyValid {
  result: "valid";
  business_name: string;
  licence_number: string;
  facility_type: string;
  lga: string | null;
  last_inspected: string;
  rating: string;
  valid_to: string;
  issuing_authority: string;
}

export interface VerifyNoRecord {
  result: "no_record";
  message: string;
}

export type VerifyResult = VerifyValid | VerifyNoRecord;

const BAND_LABEL: Record<string, string> = {
  satisfactory: "Satisfactory",
  needs_improvement: "Needs Improvement",
  critical_issues: "Critical Issues",
};

const TYPE_LABEL: Record<string, string> = {
  agro_dealer: "Agro-dealer warehouse",
  blending_plant: "Fertilizer processing and blending plant",
  manufacturing: "Manufacturing plant",
  importer: "Importer",
};

export const NO_RECORD: VerifyNoRecord = {
  result: "no_record",
  message: NO_RECORD_MESSAGE,
};

export interface ViewRow {
  verification_token: string;
  serial: string;
  business_name: string;
  licence_number: string;
  facility_type: string;
  lga: string | null;
  last_inspected: string | null;
  rating_band: string;
  valid_to: string;
  issuing_authority: string;
}

@Injectable()
export class PublicVerifyService implements OnModuleDestroy {
  private readonly logger = new Logger("PublicVerify");
  private readonly pool: Pool;

  constructor(@Inject(CONFIG) config: AppConfig) {
    if (!config.publicVerifyUsesOwnRole) {
      this.logger.warn(
        "PUBLIC_VERIFY_DATABASE_URL is not set: the public surface is sharing the " +
          "application connection. Set it to a public_verify_role connection before production.",
      );
    }
    this.pool = new Pool({ connectionString: config.publicVerifyDatabaseUrl, max: 4 });
  }

  /**
   * One query, one view, two possible answers. Every reason there is no record
   * (never inspected, expired, revoked, simply not found) returns the identical
   * neutral payload, so the caller cannot tell them apart. Absence of a record
   * is never presented as evidence of wrongdoing.
   */
  async verify(query: string): Promise<VerifyResult> {
    const q = query.trim();
    if (q.length < 3) return NO_RECORD;

    const rows = await this.pool.query<ViewRow>(
      `SELECT * FROM public_certificate_view
       WHERE upper(verification_token) = upper($1)
          OR upper(serial)             = upper($1)
          OR upper(licence_number)     = upper($1)
          OR business_name ILIKE $2
       ORDER BY valid_to DESC
       LIMIT 1`,
      [q, `%${q}%`],
    );

    return toVerifyResult(rows.rows[0]);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * The only shape a caller ever sees. Every reason there is no row collapses to
 * the same neutral payload here, which is what makes the two-answer promise a
 * property of the code rather than a convention each caller has to remember.
 */
export function toVerifyResult(row: ViewRow | undefined): VerifyResult {
  if (!row) return NO_RECORD;
  return {
    result: "valid",
    business_name: row.business_name,
    licence_number: row.licence_number,
    facility_type: TYPE_LABEL[row.facility_type] ?? row.facility_type,
    lga: row.lga,
    last_inspected: row.last_inspected ?? "",
    rating: BAND_LABEL[row.rating_band] ?? row.rating_band,
    valid_to: row.valid_to,
    issuing_authority: row.issuing_authority,
  };
}
