import jwt from "jsonwebtoken";
import pg from "pg";
import { loadConfig } from "../config/config";

// Runbook: mint a bearer token for a seeded user, so a reviewer can sign in.
//
// This is a development stand-in for the institution's identity provider and
// nothing more. It reads the roles and jurisdiction from the database rather
// than accepting them as arguments, because a token whose claims disagree with
// the database would let someone demonstrate an authorisation the platform does
// not actually grant — which is exactly the confusion a demo must not create.
//
//   DATABASE_URL=... AUTH_JWT_SECRET=... node dist/cli/mint-token.js aisha.bello@demo.agroassure.ng
//   node dist/cli/mint-token.js --list

const TTL_SECONDS = 12 * 60 * 60;

export interface TokenSubject {
  id: string;
  jurisdiction_id: string | null;
  roles: string[];
}

/**
 * The claims a token carries. Exported so the rule below is testable without a
 * database: a national role is unscoped, and stamping a jurisdiction onto one
 * would silently narrow what that person can see, which looks like a
 * permissions bug long after anyone remembers this file.
 */
export function tokenClaims(user: TokenSubject): {
  sub: string;
  roles: string[];
  jurisdiction_id?: string;
} {
  const unscoped = user.roles.includes("national_admin") || user.roles.includes("auditor");
  return {
    sub: user.id,
    roles: user.roles,
    jurisdiction_id: unscoped ? undefined : (user.jurisdiction_id ?? undefined),
  };
}

async function main(): Promise<void> {
  const config = loadConfig();
  const client = new pg.Client({ connectionString: config.databaseUrl });
  await client.connect();

  try {
    const wanted = process.argv[2];
    if (!wanted || wanted === "--list") {
      const { rows } = await client.query(
        `SELECT u.email, u.full_name, coalesce(string_agg(r.role_code, ', '), '(none)') AS roles
           FROM app_user u
           LEFT JOIN user_role r ON r.user_id = u.id
          WHERE u.status = 'active'
          GROUP BY u.id, u.email, u.full_name
          ORDER BY u.full_name`,
      );
      for (const row of rows) {
        console.log(`${row.email ?? "(no email)"}  ${row.full_name}  [${row.roles}]`);
      }
      return;
    }

    const { rows } = await client.query(
      `SELECT u.id, u.full_name, u.jurisdiction_id,
              coalesce(array_agg(r.role_code) FILTER (WHERE r.role_code IS NOT NULL), '{}') AS roles
         FROM app_user u
         LEFT JOIN user_role r ON r.user_id = u.id
        WHERE u.email = $1 AND u.status = 'active'
        GROUP BY u.id`,
      [wanted],
    );
    const user = rows[0];
    if (!user) throw new Error(`no active user with email ${wanted}`);
    if (user.roles.length === 0) {
      throw new Error(`${wanted} holds no roles; a token for them would open nothing`);
    }

    const token = jwt.sign(tokenClaims(user), config.authJwtSecret, {
      expiresIn: TTL_SECONDS,
    });

    console.log(`# ${user.full_name} [${user.roles.join(", ")}] — valid 12 hours`);
    console.log(token);
  } finally {
    await client.end();
  }
}

// Only when run as a command. This module also exports tokenClaims, and
// importing it to test that rule must not open a database connection.
if (require.main === module) {
  main().catch((err) => {
    console.error("could not mint a token:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
