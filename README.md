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
  apps/console/           The regulator console (Next.js)
  packages/domain/        Pure, portable domain logic (the device and the server share it)
  packages/field-core/    The field app's offline core: local store, outbox, authoring, drain
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
- `bootstrap.ts` — the pre-departure bundle's wire shape, defined once because
  both ends must agree on it and neither owns it
- `events.ts`, `ids.ts`, `types.ts` — event shapes, UUIDv7, the ubiquitous language

### The field offline core (`packages/field-core`)

Everything an inspection *is*, minus the screens. It imports no React Native API,
so the rules governing an evidentiary record are testable without a handset, and
the UI layer on top holds only presentation.

- `sqlite.ts` — the on-device store behind a tiny driver seam, so the same code
  runs on op-sqlite, expo-sqlite, and node:sqlite
- `outbox.ts` — event authoring: per-aggregate sequence, HLC stamp, chain link,
  hash, signature, queued in one append-only row
- `inspection.ts` — the visit: check-in binding, Yes/No/N/A with a remark
  required on an adverse answer, evidence bound to its hash at capture,
  on-device scoring, dual sign-off
- `geo.ts` — check-in geofencing; a distant check-in is flagged, never refused
- `sync.ts` — the pre-departure bundle and drain-on-signal

Two deliberate departures from the reference on-device DDL, both to remove a
failure mode rather than to save effort. Hashes are stored as hex text, because
blob binding is the one thing every React Native SQLite driver does differently.
And there is no `chain_head` or `hlc_state` table: both are just "the last event
this device authored", so they are read from the outbox instead of maintained
beside it — a separate copy could fall out of step after a crash, and a chain
head that disagrees with the log is exactly the corruption the chain exists to
detect.

Findings are derived from the adverse responses at sign-off rather than tracked
as the inspector goes, so correcting a No back to a Yes simply removes the
finding: nothing was observed, so nothing needs withdrawing. The observation
itself — the remark and the exhibit, captured when it was seen — is in the event
log either way.

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
| `console/` | The regulator surface — registry and map data, instrument versioning, inspection review, officer decisions, findings workflow, planning and risk suggestions, dashboard, certificates, users and device enrollment. |
| `certificate/` | Deterministic HTML render with a QR code, and PDF via headless Chromium. |
| `public-verify/` | The public surface. Its own connection pool, its own database role, one view. |
| `workers/` | The escalation sweep: overdue and escalation are time-driven and each one is an event. |

### The regulator console (`apps/console`)

Next.js App Router, server components reading projections through the API. It
holds no state and reaches no database: every rule that matters is enforced on
the far side of `lib/api.ts`, so no screen can be made to work by relaxing one.

| Screen | What it is for |
|---|---|
| Dashboard | Compliance tiles, the "decisions within 30 days" clock, findings by section, and risk-targeted suggestions — each shown with the reason that produced it, because a score without a reason cannot be argued with |
| Facilities | The registry, with certificate status derived at read time so a lapse shows the morning after it happens |
| Facility | Registered point, certificate history, every visit |
| Inspections | The queue, marked by what still awaits an officer decision |
| Inspection review | The full case: check-in distance, every response with its remark and exhibits, findings, decisions, and the certificate gate |
| Corrective actions | The findings worklist by severity and due date |
| Certificate | The record, its authorising officer, and the verification token behind the QR |
| Instruments | The version timeline, the in-force structure in both languages, and the explicit change list before a publish |
| Users and devices | Roles, and device enrolment against a key the device generated and never exported |

Styled to Huzex Light: `#409EF2` for action, `#072435` for text, white surfaces,
12–16px radii, soft shadows, and light blurred overlays rather than dark tints.
Every status carries a word as well as a colour, so the registry stays readable
to a colour-blind reader and in a printed export.

Sign-in is a development stand-in that stores a token in an httpOnly cookie. It
authenticates nobody. Replacing it with the institution's OpenID Connect
provider changes only that page, because nothing else asks for a token.

### The invariants, and where each one lives

| Promise | Where it is enforced |
|---|---|
| An inspection cannot be silently altered after submission | Append-only triggers, per-device hash chain, device signatures; a correction is a new record |
| One device cannot erase another's finding | Distinct aggregates per inspection; no last-write-wins anywhere; HLC ordering never implies overwrite |
| Evidence cannot be replaced after submission | Hash bound at capture, re-verified on upload, content-addressed write-once storage |
| A certificate cannot exist without a named authorising officer | `NOT NULL` columns plus the only command that can mint one |
| The public page never publishes an accusation | A separate module, a separate role, one view that physically excludes adverse data |
| A published instrument version never changes | Publish freezes the structure and its hash; inspections bind to the version they used |
| A field event can be traced to the device that wrote it | Enrollment registers an ed25519 public key the device generated and never exported; revoking it stops new events without invalidating old ones |

## Getting started

```bash
pnpm install
docker compose up -d          # PostgreSQL + PostGIS, MinIO, Redis

pnpm --filter @agroassure/domain build
pnpm --filter @agroassure/field-core build

export DATABASE_URL=postgres://agroassure:agroassure@localhost:5432/agroassure
node db/migrate.mjs --seed    # --seed adds the Katsina fixture
node db/verify-invariants.mjs # confirm the schema invariants hold

cp services/sync-gateway/.env.example services/sync-gateway/.env
pnpm gateway:dev

cp apps/console/.env.example apps/console/.env.local
pnpm console:dev              # http://localhost:3000
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
pnpm -r run test              # 103 tests, no database needed
node db/verify-invariants.mjs # the schema invariants, against a live database
pnpm test:integration         # a full lifecycle, against a disposable database
```

The integration suite walks one inspection from an offline device to the public
verification page: it enrolls the device through the administration service,
schedules the visit, fetches the day from the real `bootstrap` endpoint, authors
the inspection through `field-core`, pushes the real signed chain through the
real ingest path, projects it, closes the findings, records the officer
decision, authorises the certificate, and rebuilds every projection from the
event store alone. It builds nothing by hand that the server can build, because
a bundle the field app could not work from would otherwise pass unnoticed —
which is exactly how an earlier bootstrap shipped carrying a version label and
no checkpoints. It needs `DATABASE_URL` and
`ALLOW_DESTRUCTIVE_TEST_DB=1`, and refuses to run without the second: it appends
events that cannot be deleted afterwards and drops every projection row.

The unit suites are pure: the domain package has no I/O, the gateway's
verification logic runs against in-memory fakes with real cryptography, and
`field-core` runs against real SQLite via `node:sqlite` — so the device schema
and every statement in the store are executed as written. Node 22+ is required
for that. The invariants that live in PostgreSQL are checked separately, and CI
runs all three.

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

- **The field application's UI (React Native / Expo).** The screens, the camera
  and geolocation bindings, the Keystore-held device key, and the bilingual
  runtime. The logic underneath them is `field-core`, which is written and
  tested; what remains is presentation and the native bindings, and those can
  only be verified on a real handset.
- **A map on the registry screen.** Facilities carry coordinates and the screen
  shows them numerically; plotting them needs a tile source the institution is
  willing to send facility locations to, which is a residency decision rather
  than a rendering one.
- **Authentication.** The console and the API both use a development token
  rather than the institution-controlled OIDC provider the guide specifies.

Also outstanding: certificate PDF rendering needs Playwright and its Chromium
browser installed on the render host; the HTML route works without it.

## Reference

The AgroAssure Technical Implementation Guide is the specification this repository
implements. Behaviour it marks "Specified" follows the Concept Note, Revision 3.0;
behaviour it marks "Design recommendation" is proposed for ratification by the
deploying institution and can change without touching specified behaviour.
