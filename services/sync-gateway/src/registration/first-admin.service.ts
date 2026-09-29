import { Inject, Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { PgService } from "../db/pg.service";
import { CONFIG, type AppConfig } from "../config/config";
import type { FirstAdminConfig } from "../config/first-admin";

// The first administrator, for a deployment that has nobody yet.
//
// Everyone else arrives through someone: an invitation from an administrator,
// or a registration an administrator approves. The first person cannot, and
// with email sign-in there is no identity provider to vouch for them either —
// a fresh pilot would have only the demo accounts, whose inboxes do not exist.
//
// So the person who controls the deployment names themselves in its settings
// (FIRST_ADMIN_EMAIL, with FIRST_ADMIN_NAME and FIRST_ADMIN_STATE), and on
// start the gateway makes sure that email is a national administrator, adding
// the state if it is missing. It is safe to leave set: every step only fills
// in what is absent, and it never removes or downgrades anything. Whoever can
// change these settings can already change the database, so it grants nothing
// they did not have.

@Injectable()
export class FirstAdminService implements OnApplicationBootstrap {
  private readonly logger = new Logger("FirstAdmin");

  constructor(
    private readonly pg: PgService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const wanted = this.config.firstAdmin;
    if (!wanted) return;
    try {
      const outcome = await this.ensure(wanted);
      this.logger.log(`first administrator ${wanted.email}: ${outcome}`);
    } catch (err) {
      // A deployment that cannot do this should still serve everyone else.
      this.logger.error(`could not set up the first administrator: ${String(err)}`);
    }
  }

  /** Make sure the named person is a national administrator. Returns what it did. */
  async ensure(wanted: FirstAdminConfig): Promise<string> {
    return this.pg.transaction(async (client) => {
      const done: string[] = [];

      let state = (
        await client.query<{ id: string }>(
          `SELECT id FROM jurisdiction WHERE lower(name) = lower($1) OR code = $2 ORDER BY (lower(name) = lower($1)) DESC LIMIT 1`,
          [wanted.state, wanted.stateCode],
        )
      ).rows[0];
      if (!state) {
        state = (
          await client.query<{ id: string }>(
            `INSERT INTO jurisdiction (name, code) VALUES ($1, $2) RETURNING id`,
            [wanted.state, wanted.stateCode],
          )
        ).rows[0]!;
        done.push(`added ${wanted.state}`);
      }

      let user = (
        await client.query<{ id: string; status: string }>(
          `SELECT id, status FROM app_user WHERE lower(email) = $1`,
          [wanted.email],
        )
      ).rows[0];
      if (!user) {
        user = (
          await client.query<{ id: string; status: string }>(
            `INSERT INTO app_user (jurisdiction_id, full_name, email) VALUES ($1, $2, $3) RETURNING id, status`,
            [state.id, wanted.name, wanted.email],
          )
        ).rows[0]!;
        done.push("created the account");
      } else if (user.status !== "active") {
        // Suspended on purpose by someone; this setting does not overrule them.
        return "the account exists but is suspended, so it was left as it is";
      }

      const role = await client.query(
        // The role row names a state because the key requires one; the
        // national role is unscoped regardless of which (see rbac.isUnscoped).
        `INSERT INTO user_role (user_id, role_code, jurisdiction_id)
         SELECT $1, 'national_admin', $2
          WHERE NOT EXISTS (SELECT 1 FROM user_role WHERE user_id = $1 AND role_code = 'national_admin')`,
        [user.id, state.id],
      );
      if (role.rowCount) done.push("made national administrator");

      return done.length ? done.join(", ") : "already set up";
    });
  }
}
