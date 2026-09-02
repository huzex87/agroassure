# AgroAssure

A digital compliance and inspection platform for Nigeria's fertilizer and agro-input
value chain, built to the AgroAssure Technical Implementation Guide. It converts a
paper inspection process into a live, evidence-backed compliance record that a
regulator can own rather than depend on a vendor to change.

Regulatory anchor: National Fertilizer Quality Control Act 2019.
Data-protection anchor: Nigeria Data Protection Act 2023.
Pilot jurisdiction: Katsina State.

## Layout

```
agroassure/
  packages/domain/        Pure, portable domain logic (the device and the server share it)
  db/                     PostgreSQL migrations, a forward-only runner, and an invariant check
  services/sync-gateway/  The application tier (see below)
  docker-compose.yml      PostgreSQL + PostGIS, MinIO, Redis for local development
```

## What is built

### The shared domain (`packages/domain`)

Pure TypeScript, no I/O, portable to React Native and Node. One source of truth for
the logic that must agree on the device and the server, so the number a device
computes and the number a server verifies come from the same function.

- `scoring.ts` — weighted rating with N/A excluded; reproduces the guide's worked
  example (32 Yes, 5 No, 4 N/A → 86.49% → 86% Satisfactory)
- `risk.ts` — explainable facility risk; every suggestion carries a reason string
- `finding-state.ts` — the corrective-action state machine and SLA timing
- `certificate.ts` — validity, issuance eligibility, serial and verification-token minting
- `hashing.ts` — canonical serialization, SHA-256, ed25519 sign/verify
- `hlc.ts` — hybrid logical clocks, so ordering never implies overwriting
- `events.ts`, `ids.ts`, `types.ts` — event shapes, UUIDv7, the ubiquitous language

### The database (`db`)

An append-only event store (the system of record) plus rebuildable projections.
The invariants that matter are enforced in the schema, not left to application code:

- `event_store` blocks `UPDATE` and `DELETE` with triggers
- `certificate.authorising_officer_id` and `certificate.decision_id` are `NOT NULL`,
  so a certificate cannot exist without a named officer and a recorded decision
- `public_verify_role` holds `SELECT` on one view, so the positive-only public
  surface cannot reach adverse data
- a partial unique index keeps one instrument version in force at a time

`node db/verify-invariants.mjs` asserts every one of those against a live database
and rolls back, so they are checked rather than asserted in prose.

Requires PostgreSQL 16+ with `postgis` and `pgcrypto`.

### The application tier (`services/sync-gateway`)

A modular monolith. The domain is coherent and the transaction boundaries are
natural, so this is easier for a public institution to operate and audit than a
sprawl of services. The module boundaries are still real.

| Module | What it does |
|---|---|
| `sync/` | Ingests device-signed, hash-chained events: verifies signature, hash, and chain continuity, appends idempotently, never rejects a well-formed event on business grounds. Serves pull and the pre-departure bootstrap bundle, and stores checksummed evidence write-once. |
| `projections/` | Applies events to read models in record order, with a cursor. Projections carry no authority: `rebuild()` drops them and replays the store. |
| `events/` | The only way a server-authored fact reaches the store: attributed to the verified principal, sequenced per aggregate under an advisory lock. |
| `console/` | The regulator surface — registry and map data, instrument versioning, inspection review, officer decisions, findings workflow, planning and risk suggestions, dashboard, certificates. |
| `certificate/` | Deterministic HTML render with a QR code, and PDF via headless Chromium. |
| `public-verify/` | The public surface. Its own connection pool, its own database role, one view. |
| `workers/` | The escalation sweep: overdue and escalation are time-driven and each one is an event. |

### The invariants, and where each one lives

| Promise | Where it is enforced |
|---|---|
| An inspection cannot be silently altered after submission | Append-only triggers, per-device hash chain, device signatures; a correction is a new record |
| One device cannot erase another's finding | Distinct aggregates per inspection; no last-write-wins anywhere; HLC ordering never implies overwrite |
| Evidence cannot be replaced after submission | Hash bound at capture, re-verified on upload, content-addressed write-once storage |
| A certificate cannot exist without a named authorising officer | `NOT NULL` columns plus the only command that can mint one |
| The public page never publishes an accusation | A separate module, a separate role, one view that physically excludes adverse data |
| A published instrument version never changes | Publish freezes the structure and its hash; inspections bind to the version they used |

## Getting started

```bash
pnpm install
docker compose up -d          # PostgreSQL + PostGIS, MinIO, Redis

pnpm --filter @agroassure/domain build

export DATABASE_URL=postgres://agroassure:agroassure@localhost:5432/agroassure
node db/migrate.mjs --seed    # --seed adds the Katsina fixture
node db/verify-invariants.mjs # confirm the schema invariants hold

cp services/sync-gateway/.env.example services/sync-gateway/.env
pnpm gateway:dev
```

The public verification surface should log in as its own role. Create it once:

```sql
CREATE USER agroassure_public WITH PASSWORD 'change-me';
GRANT public_verify_role TO agroassure_public;
GRANT CONNECT ON DATABASE agroassure TO agroassure_public;
```

then set `PUBLIC_VERIFY_DATABASE_URL` to that connection. Without it the service
starts and warns; the boundary is only real once the role is in place.

If you use npm instead of pnpm, replace the `workspace:*` dependency on
`@agroassure/domain` in `services/sync-gateway/package.json` with
`"file:../../packages/domain"`, since npm does not understand `workspace:`.

## Tests

```bash
pnpm -r run test              # 72 tests, no database needed
node db/verify-invariants.mjs # the schema invariants, against a live database
```

The unit suites are pure: the domain package has no I/O, and the gateway's
verification logic is tested against in-memory fakes with real cryptography. The
invariants that live in PostgreSQL are checked separately, and CI runs both.

Two suites are regression guards rather than ordinary tests, on the two properties
most likely to be quietly broken by a future change: `certificate-invariant.spec.ts`
(a certificate cannot be minted without a decision and the deciding officer, and a
refusal must not append an event either) and `public-verify-boundary.spec.ts` (the
public module reads one relation, names no adverse table, and imports nothing that
would give it a path to one).

## Operations

```bash
node dist/cli/rebuild-projections.js   # drop read models, replay the event store
node dist/cli/escalate.js              # run the escalation sweep once, out of band
curl localhost:3001/health             # db reachability and projection lag
```

## What is not built yet

The server-side spine is complete and tested; two client surfaces are not written:

- **The field application (React Native / Expo).** The offline SQLite outbox, the
  Yes/No/N/A checklist with the adverse-response interaction, checksum-at-capture,
  on-device scoring, dual sign-off, and drain-on-signal. Every server endpoint it
  needs exists, and the domain package it would import is already shared.
- **The regulator console (Next.js).** The registry and map, dashboard, inspection
  review, findings worklist, certificate view, and template version manager. Every
  screen's data is already served by the console API.

Also outstanding: the projector and console SQL are exercised by CI against a real
PostgreSQL, but have not yet been run against a database on a developer machine
here — the first `node db/migrate.mjs && node db/verify-invariants.mjs` on a real
instance is the check that matters. Certificate PDF rendering needs Playwright and
its Chromium browser installed on the render host; the HTML route works without it.

## Reference

The AgroAssure Technical Implementation Guide is the specification this repository
implements. Behaviour it marks "Specified" follows the Concept Note, Revision 3.0;
behaviour it marks "Design recommendation" is proposed for ratification by the
deploying institution and can change without touching specified behaviour.
