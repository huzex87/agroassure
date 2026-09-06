import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Post,
  ServiceUnavailableException,
} from "@nestjs/common";
import jwt from "jsonwebtoken";
import { PgService } from "../db/pg.service";
import { CONFIG, type AppConfig } from "../config/config";
import { tokenClaims } from "../cli/mint-token";

// Signing in without an identity provider.
//
// This exists so nobody has to copy a token between a terminal and two
// applications, which is a thing people get wrong and which taught this project
// nothing except that copying long strings by hand is unreliable. It is a stand
// -in for the institution's provider and nothing more: it verifies no password
// and asks for no proof, so naming a seeded user is enough to become them.
//
// Which is exactly why it is off unless DEV_SIGNIN is set, and why the
// configuration refuses to start if it is set alongside OIDC_ISSUER. The
// shared-secret fallback at least requires the secret. This requires nothing.
//
// The claims come from the database rather than the request, for the same
// reason the CLI does it that way: a token whose roles disagree with the
// database would demonstrate an authorisation the platform does not grant.

const TTL_SECONDS = 12 * 60 * 60;

@Controller("v1/auth")
export class DevAuthController {
  constructor(
    private readonly pg: PgService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  private assertEnabled(): void {
    if (!this.config.devSignIn) {
      throw new ServiceUnavailableException(
        "development sign-in is not enabled on this deployment",
      );
    }
  }

  /** Who can be signed in as. Names and roles only; no credential is involved. */
  @Get("dev-users")
  async users() {
    this.assertEnabled();
    return this.pg.query(
      `SELECT u.id, u.full_name, u.email,
              coalesce(array_agg(r.role_code) FILTER (WHERE r.role_code IS NOT NULL), '{}') AS roles
         FROM app_user u
         LEFT JOIN user_role r ON r.user_id = u.id
        WHERE u.status = 'active'
        GROUP BY u.id, u.full_name, u.email
        ORDER BY u.full_name`,
    );
  }

  @Post("dev-signin")
  @HttpCode(200)
  async signIn(@Body() body: Record<string, unknown>) {
    this.assertEnabled();

    const email = String(body.email ?? "").trim().toLowerCase();
    const [user] = await this.pg.query<{
      id: string;
      jurisdiction_id: string | null;
      roles: string[];
    }>(
      `SELECT u.id, u.jurisdiction_id,
              coalesce(array_agg(r.role_code) FILTER (WHERE r.role_code IS NOT NULL), '{}') AS roles
         FROM app_user u
         LEFT JOIN user_role r ON r.user_id = u.id
        WHERE lower(u.email) = $1 AND u.status = 'active'
        GROUP BY u.id, u.jurisdiction_id`,
      [email],
    );
    if (!user) throw new NotFoundException("no active user with that email");

    const token = jwt.sign(tokenClaims(user), this.config.authJwtSecret, {
      expiresIn: TTL_SECONDS,
    });
    return { token, userId: user.id, roles: user.roles, expiresIn: TTL_SECONDS };
  }
}
