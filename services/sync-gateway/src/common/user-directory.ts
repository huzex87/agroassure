import { Injectable } from "@nestjs/common";
import { PgService } from "../db/pg.service";

// Who the person holding this token is, according to this platform.
//
// A token says who the provider thinks you are. Its subject is the provider's
// identifier — Auth0 stamps "auth0|68c3...", Keycloak a uuid, Azure AD an
// object id — and it is not this platform's idea of a user. Every record here
// that names a person names an app_user: an inspection's inspector, a
// certificate's authorising officer, the actor on an event. Those columns are
// uuid NOT NULL REFERENCES app_user(id).
//
// app_user.oidc_subject has always existed for this crossing. Nothing read it.
// The subject went into those columns unchanged, which worked only because a
// development token's subject was itself an app_user id — so the first real
// identity provider would have failed every write in the console with a type
// error on a uuid column, and the failure would have read as a broken database
// rather than as a missing mapping.

export interface DirectoryUser {
  id: string;
  jurisdictionId: string | null;
}

@Injectable()
export class UserDirectory {
  constructor(private readonly pg: PgService) {}

  /**
   * The app_user this subject signs in as, or null if the platform does not
   * know them.
   *
   * Matched on oidc_subject, or on the id itself so that a development token —
   * whose subject is an app_user id — keeps working without a second code path.
   * Suspended and deleted users resolve to nothing, which is the whole point of
   * suspending someone.
   *
   * ponytail: one small indexed lookup per authenticated request, deliberately
   * uncached. A cache would keep a suspended officer working until it expired,
   * and in a system that issues certificates that is the wrong trade. Add one
   * only if this query ever shows up in a latency profile.
   */
  async resolve(subject: string): Promise<DirectoryUser | null> {
    const rows = await this.pg.query<{ id: string; jurisdiction_id: string | null }>(
      `SELECT id, jurisdiction_id
         FROM app_user
        WHERE status = 'active'
          AND (oidc_subject = $1 OR id::text = $1)
        LIMIT 1`,
      [subject],
    );
    const row = rows[0];
    return row ? { id: row.id, jurisdictionId: row.jurisdiction_id } : null;
  }
}
