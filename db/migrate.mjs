#!/usr/bin/env node
// Forward-only migration runner. Applies any *.sql in ./migrations not yet
// recorded in schema_migrations, in filename order, each in its own transaction
// (the SQL files carry their own BEGIN/COMMIT). Idempotent to re-run.
//
// Usage:  DATABASE_URL=postgres://... node db/migrate.mjs
//         DATABASE_URL=postgres://... node db/migrate.mjs --seed
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const withSeed = process.argv.includes("--seed");

const client = new pg.Client({ connectionString: url });

async function ensureTable() {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    text PRIMARY KEY,
      applied_at  timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function applied() {
  const r = await client.query("SELECT filename FROM schema_migrations");
  return new Set(r.rows.map((x) => x.filename));
}

async function runDir(dir, done, record) {
  const files = (await readdir(join(__dirname, dir)))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    const key = `${dir}/${f}`;
    if (done.has(key)) {
      console.log(`skip  ${key}`);
      continue;
    }
    const sql = await readFile(join(__dirname, dir, f), "utf8");
    console.log(`apply ${key}`);
    await client.query(sql); // each file wraps itself in BEGIN/COMMIT
    if (record) {
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [key]);
    }
  }
}

(async () => {
  await client.connect();
  try {
    await ensureTable();
    const done = await applied();
    await runDir("migrations", done, true);
    if (withSeed) {
      // seeds are not tracked; they are safe to re-run (ON CONFLICT guards)
      await runDir("seed", new Set(), false);
    }
    console.log("migrations complete");
  } catch (err) {
    console.error("migration failed:", err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
