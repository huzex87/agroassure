import { createHash, randomBytes } from "node:crypto";
import {
  GoneException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PgService } from "../db/pg.service";
import { CONFIG, type AppConfig } from "../config/config";
import { InviteDelivery } from "../invitations/delivery";
import { CONSOLE_SESSION_TTL_SECONDS, signConsoleSession } from "./console-session";

// Signing in to the console with a link sent to a work email.
//
// Asking for a link answers the same way whether or not the address belongs to
// anyone, so the form cannot be used to find out who works at the regulator.
// A link works once, for fifteen minutes, and only its hash is stored. Spending
// it is a separate, deliberate step (the console shows a Continue button)
// because email security scanners open links on arrival, and a link spent by a
// scanner is a person who cannot sign in.

export function hashLinkToken(token: string): string {
  return createHash("sha256").update(`signin:${token}`).digest("hex");
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

export function signInEmail(name: string, link: string, minutes: number) {
  const first = name.trim().split(/\s+/)[0] ?? name;
  const text = [
    `Hello ${first},`,
    "",
    "Use this link to sign in to the AgroAssure console:",
    link,
    "",
    `It works once and expires in ${minutes} minutes.`,
    "If you didn't ask to sign in, you can ignore this email — nobody can sign in without the link.",
  ].join("\n");
  const html = `<!doctype html>
<html><body style="margin:0;background:#F6FAFC;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#072435">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border:1px solid #E4EDF3;border-radius:16px">
<tr><td style="padding:28px 28px 0">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="width:36px;height:36px;background:#2F93EC;border-radius:10px;color:#fff;font-weight:700;font-size:18px;text-align:center">A</td>
    <td style="padding-left:10px;font-weight:600;font-size:16px">AgroAssure</td>
  </tr></table>
  <h1 style="margin:22px 0 8px;font-size:21px">Sign in, ${escape(first)}</h1>
  <p style="margin:0;font-size:15px;line-height:1.55;color:#4A6B7C">Tap the button to sign in to the AgroAssure console.</p>
</td></tr>
<tr><td style="padding:24px 28px" align="center">
  <a href="${escape(link)}" style="display:inline-block;background:#2F93EC;color:#fff;text-decoration:none;font-weight:600;padding:13px 26px;border-radius:12px">Sign in to AgroAssure</a>
</td></tr>
<tr><td style="padding:0 28px 26px;font-size:13px;line-height:1.55;color:#7C96A4;border-top:1px solid #E4EDF3;padding-top:16px">
  The link works once and expires in ${minutes} minutes. If you didn't ask to sign in, ignore this email — nobody can sign in without the link.
</td></tr>
</table></td></tr></table></body></html>`;
  return { subject: "Your AgroAssure sign-in link", text, html };
}

@Injectable()
export class EmailSignInService {
  private readonly logger = new Logger("EmailSignIn");

  constructor(
    private readonly pg: PgService,
    private readonly delivery: InviteDelivery,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  /** Which ways in this deployment offers, for the console's sign-in page. */
  methods() {
    return {
      oidc: this.config.oidc !== null,
      email: this.config.emailSignIn !== null,
      dev: this.config.devSignIn,
    };
  }

  /**
   * Send a sign-in link, if the address belongs to an active person who holds
   * a role. Always resolves the same way; what happened is only logged.
   */
  async start(rawEmail: string): Promise<void> {
    const cfg = this.config.emailSignIn;
    if (!cfg) throw new ServiceUnavailableException("email sign-in is not set up on this server");

    const email = rawEmail.trim().toLowerCase();
    const [user] = await this.pg.query<{ id: string; full_name: string; email: string }>(
      `SELECT u.id, u.full_name, u.email FROM app_user u
        WHERE lower(u.email) = $1 AND u.status = 'active'
          AND EXISTS (SELECT 1 FROM user_role r WHERE r.user_id = u.id)`,
      [email],
    );
    if (!user) {
      this.logger.log("sign-in link requested for an address with no active account");
      return;
    }

    const token = randomBytes(32).toString("base64url");
    await this.pg.query(
      `INSERT INTO sign_in_link (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + make_interval(mins => $3))`,
      [user.id, hashLinkToken(token), cfg.linkTtlMinutes],
    );

    const link = `${cfg.consoleUrl}/signin/verify?token=${token}`;
    const outcome = await this.delivery.sendEmailContent(
      user.email,
      signInEmail(user.full_name, link, cfg.linkTtlMinutes),
    );
    if (outcome.status !== "sent") {
      this.logger.warn(`sign-in link for ${user.id} not delivered: ${outcome.detail ?? outcome.status}`);
    }
  }

  /** Spend a link: exactly once, before it expires, for someone still active. */
  async verify(token: string): Promise<{ token: string; expiresIn: number; fullName: string }> {
    const cfg = this.config.emailSignIn;
    if (!cfg) throw new ServiceUnavailableException("email sign-in is not set up on this server");

    const rows = await this.pg.query<{ user_id: string; full_name: string }>(
      `WITH spent AS (
         UPDATE sign_in_link SET used_at = now()
          WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
          RETURNING user_id
       )
       SELECT u.id AS user_id, u.full_name
         FROM spent JOIN app_user u ON u.id = spent.user_id
        WHERE u.status = 'active'`,
      [hashLinkToken(token)],
    );
    const person = rows[0];
    if (!person) {
      throw new GoneException({
        message: "This sign-in link has expired or has already been used. Ask for a new one.",
        reason: "link_invalid",
      });
    }
    return {
      token: signConsoleSession(person.user_id, cfg.sessionSecret),
      expiresIn: CONSOLE_SESSION_TTL_SECONDS,
      fullName: person.full_name,
    };
  }
}
