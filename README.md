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

### Deploying the shared preview

The console is a Next.js app and deploys to Vercel unchanged. The gateway does
not: it is a long-running process with two timers — the projector sweeping the
event store into the read models, and the escalation worker marking findings
overdue — and a serverless host would build it happily and then run neither.
The console would keep rendering, just with projections that quietly stopped
advancing. It also needs PostgreSQL with PostGIS, because check-in distances are
`geography` columns.

So the gateway ships as a container. `render.yaml` is a Render blueprint for a
web service plus a Postgres instance; the same `Dockerfile` runs anywhere.

```bash
# Point the console at the deployed gateway (Vercel project env var)
AGROASSURE_API_URL=https://agroassure-gateway.onrender.com

# Mint a sign-in token for a seeded user, on the gateway host
pnpm --filter @agroassure/sync-gateway run token:mint -- --list
pnpm --filter @agroassure/sync-gateway run token:mint -- aisha.bello@demo.agroassure.ng
```

Migrations run on container boot; the runner is forward-only and idempotent, so
a restart is a no-op. `SEED_DEMO_DATA=true` additionally loads the Katsina seed
and five fictional staff. **Leave it unset anywhere holding real data** — the
seed asserts that people exist who do not.

Two things this deployment is not. It is not NDPA-resident: no mainstream
container host has a Nigerian region, and the platform's own processing record
(`GET /v1/audit/ropa`) states that no personal data leaves the country, so this
preview must carry seeded data only. And evidence objects are written to a
container-local directory that is lost on redeploy; production needs the
object-locked bucket, which is what makes "cannot be replaced after submission"
a storage guarantee rather than a UI rule.

## What is not built yet

The server-side spine is complete and tested. What remains:

- **Verification of the field application on a handset.** The Expo app is
  written — today's visits, the checklist, capture, sign-off, the bilingual
  runtime — and it typechecks against `field-core`, but no screen and none of
  the native bindings have been run. There is no emulator on the machine it was
  built on.
- **A map on the registry screen.** Facilities carry coordinates and the screen
  shows them numerically; plotting them needs a tile source the institution is
  willing to send facility locations to, which is a residency decision rather
  than a rendering one.
- **The console's sign-in flow.** The gateway now verifies real OIDC tokens,
  but the console still asks for a pasted token rather than redirecting to the
  provider. Finishing it needs a registered client id, secret and redirect URI
  at an actual provider, so it is written when there is one to test against
  rather than shipped unexercised.

Also outstanding: certificate PDF rendering needs Playwright and its Chromium
browser installed on the render host; the HTML route works without it.

## Authentication and evidence

Both were development stand-ins and are now real, though only the gateway side
is finished.

**Tokens.** With `OIDC_ISSUER` and `OIDC_AUDIENCE` set, bearer tokens are
verified against the provider's published keys, checking issuer and audience,
and only asymmetric algorithms are accepted — a symmetric token is refused even
if it is otherwise well formed, which is what closes the algorithm-confusion
hole. Roles and jurisdiction arrive as namespaced custom claims (they are this
platform's concepts, not the provider's), and a role the service does not
implement is dropped rather than carried through. Without an issuer configured
the gateway falls back to a shared secret, says so loudly at boot, and refuses
to start if it has neither.

Authorization did not change and is still evaluated server-side from the
verified principal (P5). A device's authority to author events is still its
enrolled signing key; the token only says which device is talking.

**Evidence.** `EVIDENCE_STORE=s3` puts exhibits in a bucket under object-lock in
COMPLIANCE mode with a per-object retention, which no one can shorten — not the
operator, not the account root, not this code. The bucket must be created with
versioning and object-lock enabled; object-lock cannot be turned on afterwards.
`EVIDENCE_S3_ENDPOINT` points at a Nigeria-resident S3-compatible provider or at
MinIO locally. The default `local` store emulates write-once on a filesystem and
is honest about it in `/health`: it stops this application replacing an exhibit,
but not an operator with a shell.

The checksum is verified against the bytes in one place regardless of backend,
before anything is written, so a device cannot upload one file while claiming
the hash of another. `StorageService.verify()` re-reads an object and confirms it
still hashes to its own content address — which is what answers "has this
photograph been altered", rather than trusting a `locked` flag.

## Observability

```bash
curl localhost:3001/health    # db, projection lag, and which evidence store is live
curl localhost:3001/metrics   # Prometheus text format
```

Logs are JSON lines carrying a correlation id, the route, and — once the token
is verified — the acting user and device. An inbound `x-request-id` is honoured
so a trace continues from the console rather than restarting at the gateway, and
it is echoed back so a caller can quote it. Ids are logged; event content is not.
Remarks, representative names and coordinates are personal data and stay in the
event store, which is access-controlled and covered by the processing record.

`/metrics` carries no identifiers at all — no user, device or facility labels —
so it is scrapeable by the institution's monitoring without that being a
disclosure. There is a test asserting exactly that, because a helpful label is
the easy way to turn this endpoint into a data export by accident.

## Reference

The AgroAssure Technical Implementation Guide is the specification this repository
implements. Behaviour it marks "Specified" follows the Concept Note, Revision 3.0;
behaviour it marks "Design recommendation" is proposed for ratification by the
deploying institution and can change without touching specified behaviour.
