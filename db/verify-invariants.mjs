#!/usr/bin/env node
// Verify the invariants that live in the database rather than in application
// code. These are the promises a future code change is most likely to break
// quietly, and the only honest way to test them is against a real PostgreSQL:
//
//   1. event_store is append-only (UPDATE and DELETE are blocked)
//   2. a certificate cannot exist without a decision and a named officer
//   3. the public role can read one view and nothing else
//   4. the public view shows currently valid certificates only
//   5. one version of an instrument is in force at a time
//
// Everything runs inside a transaction that is rolled back, so the check leaves
// no rows behind and is safe to run against a seeded development database.
//
//   DATABASE_URL=postgres://... node db/verify-invariants.mjs

import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
let failures = 0;

function pass(name) {
  console.log(`  ok    ${name}`);
}

function fail(name, detail) {
  failures += 1;
  console.error(`  FAIL  ${name}\n        ${detail}`);
}

/** Assert that a statement is refused by the database. */
async function refuses(name, sql, params = []) {
  await client.query("SAVEPOINT s");
  try {
    await client.query(sql, params);
    await client.query("ROLLBACK TO SAVEPOINT s");
    fail(name, "the statement succeeded; it should have been refused");
  } catch (err) {
    await client.query("ROLLBACK TO SAVEPOINT s");
    pass(`${name} (${err.message.split("\n")[0]})`);
  }
}

/** Assert that a statement is accepted. */
async function accepts(name, sql, params = []) {
  await client.query("SAVEPOINT s");
  try {
    const r = await client.query(sql, params);
    await client.query("RELEASE SAVEPOINT s");
    pass(name);
    return r;
  } catch (err) {
    await client.query("ROLLBACK TO SAVEPOINT s");
    fail(name, err.message.split("\n")[0]);
    return null;
  }
}

async function main() {
  await client.connect();
  await client.query("BEGIN");

  try {
    // ---- fixtures ---------------------------------------------------------
    const { rows: [jx] } = await client.query(
      `INSERT INTO jurisdiction (name, code) VALUES ('Invariant Check', 'ZZ') RETURNING id`,
    );
    const { rows: [authority] } = await client.query(
      `INSERT INTO issuing_authority (jurisdiction_id, display_name, legal_name)
       VALUES ($1, 'Mandated regulator', 'Check authority') RETURNING id`,
      [jx.id],
    );
    const { rows: [officer] } = await client.query(
      `INSERT INTO app_user (jurisdiction_id, full_name) VALUES ($1, 'Check Officer') RETURNING id`,
      [jx.id],
    );
    const { rows: [device] } = await client.query(
      `INSERT INTO device (jurisdiction_id, assigned_user_id, public_key)
       VALUES ($1, $2, '\\x00') RETURNING id`,
      [jx.id, officer.id],
    );
    const { rows: [instrument] } = await client.query(
      `INSERT INTO instrument (jurisdiction_id, facility_type, name)
       VALUES ($1, 'agro_dealer', 'Check instrument') RETURNING id`,
      [jx.id],
    );
    const { rows: [version] } = await client.query(
      `INSERT INTO instrument_version (instrument_id, version_label, status)
       VALUES ($1, 'v1.0', 'in_force') RETURNING id`,
      [instrument.id],
    );
    const { rows: [facility] } = await client.query(
      `INSERT INTO facility (id, jurisdiction_id, licence_number, facility_type, name)
       VALUES (gen_random_uuid(), $1, 'CHK/0001', 'agro_dealer', 'Check Facility') RETURNING id`,
      [jx.id],
    );
    const { rows: [inspection] } = await client.query(
      `INSERT INTO inspection (id, reference, facility_id, instrument_version_id, structure_hash,
                               inspector_user_id, device_id, status, rating_percent, rating_band,
                               submitted_at)
       VALUES (gen_random_uuid(), 'INS-ZZ-CHECK-1', $1, $2, '\\x00', $3, $4,
               'submitted', 86.49, 'satisfactory', now())
       RETURNING id`,
      [facility.id, version.id, officer.id, device.id],
    );
    const { rows: [decision] } = await client.query(
      `INSERT INTO decision (id, inspection_id, officer_id, decision_type)
       VALUES (gen_random_uuid(), $1, $2, 'authorise_certificate') RETURNING id`,
      [inspection.id, officer.id],
    );

    // ---- 1. the event store is append-only --------------------------------
    console.log("\nevent_store is append-only");
    const { rows: [event] } = await client.query(
      `INSERT INTO event_store (event_id, aggregate_type, aggregate_id, seq, event_type,
                                payload, actor_user_id, hlc, event_hash)
       VALUES (gen_random_uuid(), 'inspection', $1, 1, 'InspectionStarted',
               '{}'::jsonb, $2, '000000000000001:00000:check', '\\xaa')
       RETURNING event_id`,
      [inspection.id, officer.id],
    );
    await refuses(
      "UPDATE on event_store is refused",
      `UPDATE event_store SET payload = '{"tampered":true}'::jsonb WHERE event_id = $1`,
      [event.event_id],
    );
    await refuses(
      "DELETE on event_store is refused",
      `DELETE FROM event_store WHERE event_id = $1`,
      [event.event_id],
    );

    // ---- 2. the certificate invariant -------------------------------------
    console.log("\na certificate cannot exist without a decision and a named officer");
    const certColumns = `(id, serial, facility_id, inspection_id, decision_id,
                          authorising_officer_id, issuing_authority_id, rating_band,
                          rating_percent, issued_on, valid_to, next_due_on, verification_token)`;

    await refuses(
      "a certificate without an authorising officer is refused",
      `INSERT INTO certificate ${certColumns}
       VALUES (gen_random_uuid(), 'AA-ZZ-0001-0001', $1, $2, $3, NULL, $4,
               'satisfactory', 86.49, current_date, current_date + 365, current_date + 182, 'TOK-1')`,
      [facility.id, inspection.id, decision.id, authority.id],
    );
    await refuses(
      "a certificate without a decision is refused",
      `INSERT INTO certificate ${certColumns}
       VALUES (gen_random_uuid(), 'AA-ZZ-0001-0002', $1, $2, NULL, $3, $4,
               'satisfactory', 86.49, current_date, current_date + 365, current_date + 182, 'TOK-2')`,
      [facility.id, inspection.id, officer.id, authority.id],
    );
    await refuses(
      "a certificate whose validity ends before it starts is refused",
      `INSERT INTO certificate ${certColumns}
       VALUES (gen_random_uuid(), 'AA-ZZ-0001-0003', $1, $2, $3, $4, $5,
               'satisfactory', 86.49, current_date, current_date - 1, current_date + 182, 'TOK-3')`,
      [facility.id, inspection.id, decision.id, officer.id, authority.id],
    );
    const certificate = await accepts(
      "a certificate with both is accepted",
      `INSERT INTO certificate ${certColumns}
       VALUES (gen_random_uuid(), 'AA-ZZ-0001-0004', $1, $2, $3, $4, $5,
               'satisfactory', 86.49, current_date, current_date + 365, current_date + 182, 'TOK-4')
       RETURNING id`,
      [facility.id, inspection.id, decision.id, officer.id, authority.id],
    );

    // ---- 3. the public role reads one view --------------------------------
    console.log("\nthe public role can reach one view and nothing else");
    const { rows: grants } = await client.query(
      `SELECT table_name, privilege_type
       FROM information_schema.role_table_grants
       WHERE grantee = 'public_verify_role'`,
    );
    const granted = grants.map((g) => `${g.table_name}:${g.privilege_type}`).sort();
    if (granted.length === 1 && granted[0] === "public_certificate_view:SELECT") {
      pass("public_verify_role holds exactly SELECT on public_certificate_view");
    } else {
      fail(
        "public_verify_role holds exactly SELECT on public_certificate_view",
        `it holds: ${granted.join(", ") || "(nothing)"}`,
      );
    }

    const { rows: viewColumns } = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'public_certificate_view'`,
    );
    const leaky = viewColumns
      .map((c) => c.column_name)
      .filter((c) => /finding|remark|decision|evidence|officer|basis|severity/i.test(c));
    if (leaky.length === 0) {
      pass("the public view exposes no adverse column");
    } else {
      fail("the public view exposes no adverse column", `found: ${leaky.join(", ")}`);
    }

    // ---- 4. the view shows currently valid certificates only ---------------
    console.log("\nthe public view shows currently valid certificates only");
    const visible = async () => {
      const { rows } = await client.query(
        `SELECT count(*)::int AS n FROM public_certificate_view WHERE serial = 'AA-ZZ-0001-0004'`,
      );
      return rows[0].n;
    };
    if ((await visible()) === 1) {
      pass("a valid certificate is visible");
    } else {
      fail("a valid certificate is visible", "it was not returned by the view");
    }

    if (certificate) {
      await client.query(`UPDATE certificate SET status = 'revoked' WHERE id = $1`, [
        certificate.rows[0].id,
      ]);
      if ((await visible()) === 0) {
        pass("a revoked certificate disappears from the view");
      } else {
        fail("a revoked certificate disappears from the view", "the view still returns it");
      }

      await client.query(
        `UPDATE certificate SET status = 'valid', valid_to = current_date - 1 WHERE id = $1`,
        [certificate.rows[0].id],
      );
      if ((await visible()) === 0) {
        pass("a lapsed certificate disappears from the view");
      } else {
        fail("a lapsed certificate disappears from the view", "the view still returns it");
      }
    }

    // ---- 5. one version in force at a time --------------------------------
    console.log("\none version of an instrument is in force at a time");
    await refuses(
      "a second in-force version of the same instrument is refused",
      `INSERT INTO instrument_version (instrument_id, version_label, status)
       VALUES ($1, 'v2.0', 'in_force')`,
      [instrument.id],
    );
    await accepts(
      "a draft alongside an in-force version is accepted",
      `INSERT INTO instrument_version (instrument_id, version_label, status)
       VALUES ($1, 'v2.0', 'draft')`,
      [instrument.id],
    );
  } finally {
    // Nothing above is meant to persist.
    await client.query("ROLLBACK");
    await client.end();
  }

  console.log("");
  if (failures > 0) {
    console.error(`${failures} invariant check(s) failed`);
    process.exit(1);
  }
  console.log("all schema invariants hold");
}

main().catch((err) => {
  console.error("invariant check could not run:", err.message);
  process.exit(1);
});
