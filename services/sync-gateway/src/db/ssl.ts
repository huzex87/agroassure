import { readFileSync } from "node:fs";
import type { ConnectionOptions } from "node:tls";

// How a database connection is encrypted, and whether it is authenticated.
//
// These are different questions and it is easy to answer only the first. A
// managed Postgres reached over the public internet presents a chain Node does
// not trust out of the box, and the quickest way past that — sslmode=no-verify
// in the URL — encrypts the connection and then accepts whatever certificate
// answers. That is fine for running a migration from a laptop and wrong for a
// service carrying compliance records: an active machine-in-the-middle can hold
// both ends of an encrypted conversation.
//
// Give it the provider's CA and the connection is both encrypted and
// authenticated. PGSSLROOTCERT_PEM takes the certificate inline because that is
// what a container host's environment can actually hold; PGSSLROOTCERT takes a
// path, for anywhere with a filesystem to put one on.

export function sslOptionsFor(env: NodeJS.ProcessEnv = process.env): ConnectionOptions | undefined {
  const inline = env.PGSSLROOTCERT_PEM?.trim();
  if (inline) {
    // Rendered through an environment variable, so real newlines may have
    // survived as the two characters "\n". Both forms are accepted.
    return { ca: inline.replace(/\n/g, "\n"), rejectUnauthorized: true };
  }

  const path = env.PGSSLROOTCERT?.trim();
  if (path) return { ca: readFileSync(path, "utf8"), rejectUnauthorized: true };

  // Nothing configured: leave it to the connection string, which is how a
  // laptop against a local cluster and a test against a container both work.
  return undefined;
}

/** True when the URL asks for encryption without authentication. */
export function isUnverifiedSsl(connectionString: string): boolean {
  return /[?&]sslmode=(no-verify|allow|prefer|disable)\b/.test(connectionString);
}
