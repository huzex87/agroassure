import { describe, it, expect, beforeAll, vi } from "vitest";
import type { AppConfig } from "../../src/config/config";
import { PgService } from "../../src/db/pg.service";
import { UserDirectory } from "../../src/common/user-directory";
import { EmailSignInService } from "../../src/auth/email-sign-in.service";
import { verifyConsoleSession } from "../../src/auth/console-session";

// Signing in by email, against a real database: a link is sent only to a real
// active person, works exactly once, and a suspended person's session stops
// working on their next request.

const DATABASE_URL = process.env.DATABASE_URL;
const ALLOWED = process.env.ALLOW_DESTRUCTIVE_TEST_DB === "1";
const runIf = DATABASE_URL && ALLOWED ? describe : describe.skip;
const SECRET = "integration-console-session-secret-32+chars";

runIf("email sign-in", () => {
  let pg: PgService;
  let service: EmailSignInService;
  let directory: UserDirectory;
  const sent: Array<{ to: string | null; text: string }> = [];
  let userId: string;
  let email: string;

  beforeAll(async () => {
    const config = {
      databaseUrl: DATABASE_URL,
      oidc: null,
      devSignIn: false,
      emailSignIn: { sessionSecret: SECRET, consoleUrl: "https://console.test", linkTtlMinutes: 15 },
    } as AppConfig;
    pg = new PgService(config);
    directory = new UserDirectory(pg);
    const delivery = {
      sendEmailContent: vi.fn(async (to: string | null, c: { text: string }) => {
        sent.push({ to, text: c.text });
        return { to, status: "sent" as const, detail: null };
      }),
    };
    service = new EmailSignInService(pg, delivery as never, config);

    const code = `E${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    const jurisdictionId = (
      await pg.query<{ id: string }>(`INSERT INTO jurisdiction (name, code) VALUES ($1,$2) RETURNING id`, [
        `Email ${code}`,
        code,
      ])
    )[0]!.id;
    email = `officer.${code.toLowerCase()}@example.gov.ng`;
    userId = (
      await pg.query<{ id: string }>(
        `INSERT INTO app_user (jurisdiction_id, full_name, email) VALUES ($1,'Ibrahim Danjuma',$2) RETURNING id`,
        [jurisdictionId, email],
      )
    )[0]!.id;
    await pg.query(`INSERT INTO user_role (user_id, role_code, jurisdiction_id) VALUES ($1,'authorising_officer',$2)`, [
      userId,
      jurisdictionId,
    ]);
  });

  const linkToken = () => /token=([A-Za-z0-9_-]+)/.exec(sent.at(-1)!.text)![1]!;

  it("sends nothing, and says nothing, for an address with no account", async () => {
    await service.start("nobody@example.gov.ng");
    expect(sent).toHaveLength(0);
  });

  it("sends a link to a real person, however their address is cased", async () => {
    await service.start(email.toUpperCase());
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(email);
    expect(sent[0]!.text).toContain("https://console.test/signin/verify?token=");

    const stored = await pg.query(`SELECT 1 FROM sign_in_link WHERE token_hash = $1`, [linkToken()]);
    expect(stored).toHaveLength(0); // only the hash is kept
  });

  it("exchanges the link for a session exactly once", async () => {
    const token = linkToken();
    const session = await service.verify(token);
    expect(session.fullName).toBe("Ibrahim Danjuma");
    expect(verifyConsoleSession(session.token, SECRET).sub).toBe(userId);

    await expect(service.verify(token)).rejects.toMatchObject({ response: { reason: "link_invalid" } });
  });

  it("refuses an expired link", async () => {
    await service.start(email);
    await pg.query(`UPDATE sign_in_link SET expires_at = created_at + interval '1 second' WHERE used_at IS NULL`);
    await new Promise((r) => setTimeout(r, 1100));
    await expect(service.verify(linkToken())).rejects.toMatchObject({ response: { reason: "link_invalid" } });
  });

  it("gives the register's roles to a session, and none once suspended", async () => {
    expect(await directory.resolveConsoleUser(userId)).toMatchObject({ roles: ["authorising_officer"] });
    await pg.query(`UPDATE app_user SET status = 'suspended' WHERE id = $1`, [userId]);
    expect(await directory.resolveConsoleUser(userId)).toBeNull();
  });
});
