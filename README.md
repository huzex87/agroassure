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
| Home | Compliance tiles, the "decisions within 30 days" clock, findings by section, and risk-targeted suggestions — each shown with the reason that produced it, because a score without a reason cannot be argued with |
| Facilities | The registry, with certificate status derived at read time so a lapse shows the morning after it happens |
| Facility | Registered point, certificate history, every visit |
| Inspections | The queue, marked by what still awaits an officer decision |
| Inspection review | The full case: check-in distance, every response with its remark and exhibits, findings, decisions, and the certificate gate |
| Corrective actions | The findings worklist by severity and due date |
| Certificate | The record, its authorising officer, and the verification token behind the QR |
| Instruments | The version timeline, the in-force structure in both languages, and the explicit change list before a publish |
| Settings → Team | Roles, and phone set-up against a key the device generated and never exported |

Styled in the AgroAssure palette: Pine for the sidebar and headings, Forest for
action, Leaf for shapes, Millet gold for the current page and the one thing to
do next. It follows the device's light or dark setting and has a toggle in the
sidebar. Every status carries a word and an icon as well as a colour, so the
registry stays readable to a colour-blind reader and in a printed export. The
full guide is [`docs/brand-guide.md`](docs/brand-guide.md).

Staff sign in with an emailed one-time link (or the institution's OpenID Connect
provider, if one is configured). The token lives in an httpOnly cookie, and the
console only checks that a session exists: the gateway decides whether it is
valid and what the person may do.

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
pnpm -r run test              # unit tests, no database needed
pnpm --filter @agroassure/console run build && pnpm --filter @agroassure/console run smoke
                              # the console in a real browser, against a stub gateway
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

- **The field application's native bindings, on a handset.** The screens
  themselves are exercised: `apps/field/test` renders them against the real
  device core — real SQLite, real hash chain, real `FieldInspection` — with only
  the camera, GPS, keystore and network replaced, and that is what found the
  render loop both screens carried. What has still never run is the native side:
  expo-camera, expo-location, expo-secure-store and expo-sqlite against actual
  hardware. There is no emulator on the machine this was built on, so the
  remaining check is Expo Go on a real Android phone.
- **The token exchange against a real provider.** The console's OIDC redirect,
  its state and PKCE handling, and every failure path are written and exercised
  in a browser; the one step never run is the code-for-token call itself, which
  needs a registered client at an actual provider. Nothing about it is a trust
  boundary — the gateway verifies the token independently — so a mistake there
  fails visibly at sign-in rather than letting anyone past.

Also outstanding: certificate PDF rendering needs Playwright and its Chromium
browser installed on the render host; the HTML route works without it.

## Setting up a new state

Until a state has planned its first visits, the home page shows a four-step
checklist. Each step ticks itself off from the record (`GET /v1/setup`), not
from anyone clicking "done":

1. **Add your facilities.** Go to *Facilities → Add facility*, or *Import* the
   spreadsheet the office already keeps. Save it as CSV (a template is
   offered). Common headings such as "Business name" or "Licence No." are
   recognised, "Agro dealer" is understood however it is spelled, and
   coordinates can be two columns or one cell. Every row is checked on the
   server before anything is saved, and the preview lists what is wrong with
   each rejected row by its row number in the sheet. The rows that pass are
   imported together in one transaction (`POST /v1/facilities/import`). A
   licence number already in the registry is refused before any event is
   written, both here and on the single-facility form.
2. **Check your checklists.** Publish the questions inspectors answer on site.
3. **Invite your inspectors.** Covered in the next section.
4. **Plan the first visits.** *Visits* shows every inspector, whether
   their phone is set up and how many visits they already have. Tick
   facilities, sorted with never-inspected and overdue first, and add a reason
   the inspector will see. A batch is all or nothing
   (`POST /v1/assignments/batch`), and a facility that already has a visit
   planned can't be planned twice. Risk suggestions sit alongside with their
   reasons and a one-click *Send*.

Reviewing the first inspection is not a setup step: it is the work, and it
happens by itself once an inspector submits one.

The menu is five everyday links — *Home, Visits, Inspections, Findings,
Facilities* — and one *Settings* page that holds the occasional jobs (*Team,
Checklists, Programme overview*). Each person sees only what their role can use
(`GET /v1/me`). The gateway still authorises every request.

Shipping a default, already-published checklist would remove step 2 too, but it
needs the real questions from the Technical Implementation Guide; the repository
only holds placeholders, and inspection questions are not something to invent.
Load them as the in-force version for each facility type and that step can go.

## Getting an inspector working

One form in the console, one code on the phone. Nothing waits on anybody.

1. **Invite.** An administrator opens **Settings → Team** and enters the inspector's name
   and phone number (email optional). The gateway creates them with the
   inspector role and issues a one-time code, e.g. `K7PM-4XQ2`, sent by SMS and
   email. The console shows the same code and a QR code, for someone standing
   at the desk, and says which channel it went out on.
2. **Enter the code.** The inspector installs the app and types the code — or
   taps the link in the message, which opens the app with the code already
   filled in. The app uses the phone's language (one tap switches it), and
   asks nothing else first.
3. **Inspect.** The phone is active straight away. Assigned visits arrive on
   their own, and finished work sends itself whenever there is a signal.

Sending the invite *is* the approval. The phone still generates its own
ed25519 key and registers only the public half, so every event stays
attributable to one person on one phone. The only change is that the
administrator's decision comes before the phone exists, not after.

- **Codes** use 8 characters with no look-alikes, work once, expire after
  `INVITE_TTL_HOURS` (72 by default), and are stored as an HMAC rather than in
  plain text. Sending a new code cancels the old one. `POST /v1/auth/activate`
  is rate limited per address.
- **Phone sessions** are signed with `DEVICE_TOKEN_SECRET` and carry no roles.
  On every request the guard checks that the phone is still active and the
  person is still an active inspector. **Sign out remotely** on the Team page
  therefore takes effect on the phone's next request.
- **Delivery.** Email goes through Resend or SendGrid (`EMAIL_PROVIDER`). SMS
  goes through Termii, Africa's Talking or Twilio (`SMS_PROVIDER`), using
  Termii's DND route by default so numbers on the do-not-disturb list are still
  reached. Local numbers such as `0803 123 4567` become `+2348031234567`. A
  failed send never fails the invite; the console says what happened. See
  `.env.example` for every setting.

## Testing with real people

**New here?** Start with the [`docs/handbook.md`](docs/handbook.md): what administrators, inspectors and office staff each do first.

The guides, one for each reader:

- [`docs/handbook.md`](docs/handbook.md): for everyone who uses it. What
  administrators, inspectors and office staff each do, and what to do when
  something goes wrong.
- [`docs/owner-guide.md`](docs/owner-guide.md): for the person who runs the
  deployment. The accounts, the settings, the first sign-in, and how to read the
  System status page.
- [`docs/phone-field-test.md`](docs/phone-field-test.md): a one-hour script for
  trying the phone app on a real handset.
- [`docs/handover.md`](docs/handover.md): for the owner, on the day the system goes
  to the people who will run it. A checklist, who owns what, and what to do when
  something goes wrong.
- [`docs/brand-guide.md`](docs/brand-guide.md): for anyone making a screen, a
  document or a message that carries the name. The logo, colours, type and voice.

Longer step-by-step detail (SMS and email providers, the Android build, a full
testing script with expected results) is kept in [`docs/reference/`](docs/reference/).

## People asking to join

Invitations start with the administrator and are the normal way in. Registration
starts with the person; it is built and tested but switched off unless
`SELF_REGISTRATION=on`, so the apps show one way in by default.

1. **Ask.** An inspector taps **Register instead** on the app's first screen; a
   supervisor, officer or administrator uses **Request access** on the console's
   sign-in page. They give their name, phone, email and state.
2. **Prove it.** A 6-digit code goes to the phone by SMS and another to the
   email. Both must be typed back, so an administrator never sees a request
   with an unproven contact. Codes expire after 30 minutes; a wrong one is
   named, and a right one entered beside it still counts.
3. **Approve.** The state's administrators are emailed, the dashboard shows
   "N people are waiting to join", and **Settings → Team → Requests to join** lists each
   person with a tick against each proven contact. The administrator picks the
   role — it starts at *Inspector* for app requests and *Desk supervisor* for
   website ones — and approves, or rejects with a reason that is sent on.
4. **In.** The person is told by email and SMS. A phone request approved as an
   inspector is already that inspector's active phone: the request carried the
   phone's public key, approval registers it, and the waiting screen's next
   check returns a session. They see their visits — no invite code, and no
   PIN to choose first. Someone who asked on the website and is approved as an inspector has
   no phone on file yet, so approval sends them an invite code at once, to the
   SMS and email they just proved. Office staff sign in to the console with the
   emailed link.

Nothing is granted before approval: a registration is a request, not an
account. Only a national administrator can grant the national role, and a
state administrator only sees and decides requests for their own state. Codes
and the registrant's status token are stored only as hashes. The open
endpoints (`/v1/register/*`) are rate limited per phone number and per email
address — what stops the form being used to flood a stranger with codes — with
a looser ceiling per source address, since every website request reaches the
gateway from the console's own server. Registration is **off by default** — administrators invite their
own staff, which is one form and one code. Set `SELF_REGISTRATION=on` to open it;
it then runs whenever both an email and an SMS provider are configured.

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

The console signs in through the same provider, with PKCE and a state cookie —
without the state check, a link could complete a sign-in as somebody else in an
officer's browser. Set `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` and
`OIDC_REDIRECT_URI` (`.../signin/callback`); leave any of them unset and the
console keeps the development token box, because half-configured has to mean not
configured rather than a partly built redirect nobody can get back out of.

**Email sign-in.** With `CONSOLE_URL` and `CONSOLE_SESSION_SECRET` set, staff
can sign in by entering their work email and receiving a one-time link that
works for 15 minutes. The request gets the same response whether or not the
address has an account, only a hash of each link is stored, and the link is
used up only when the person taps **Continue** (email scanners open links on
arrival). A console session carries no roles; the gateway reads the person's
roles from the database on every request, just as it does for phone sessions.
A pilot can run on this instead of OIDC. In that case it refuses to start if
`AUTH_JWT_SECRET` is still set, because that secret can mint a token for any
role.

**Phone PIN.** Optional. After setup the welcome screen offers **Add a PIN**, and
**Account → App PIN** adds or changes one at any time; a phone without one opens
straight to the app and relies on the handset's own screen lock plus remote
sign-out. Once set, the app asks for the 4-digit PIN when it opens and when it
returns after 5 minutes away. The PIN is stored salted and hashed in the
phone's secure storage. Forgetting it, or getting it wrong 5 times, signs the
person out but keeps the phone's key and any unsent inspections, so a new
invite code for the same person brings everything back.

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

## The registry map

Facilities are plotted from their own coordinates with no basemap behind them.
A tile layer would send the location of every regulated facility in the state to
whoever serves the tiles, on every page view, and that is a residency and
disclosure decision belonging to the institution rather than a rendering choice.
Relative position answers what the screen actually raises — whether the overdue
cluster sits in one LGA, whether a facility is nowhere near the others — without
telling anyone outside the building anything.

Status is carried by size and a ring as well as by tint, so the map survives a
colour-blind reader and a monochrome print, and each point names its facility
and status in a `<title>`. If a tile source is ever approved, it goes in
`components/registry-map.tsx` and nothing else changes.

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
