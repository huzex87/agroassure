# @agroassure/sync-gateway

The field-app sync surface for AgroAssure. It ingests device-signed events,
verifies them, appends them to the append-only event store, serves the pull and
bootstrap surfaces, and accepts checksummed evidence.

## What it enforces

The ingest path is the reason an inspection cannot be silently altered. For every
pushed event it checks, in order:

1. hash integrity: the claimed `event_hash` must match the canonical bytes of the event
2. authenticity: the `device_sig` must verify against the hash under the enrolled device key
3. chain continuity: `prev_hash` must equal the current head of that device's chain
4. idempotent append: insert is keyed on `event_id`, so a replayed batch is a no-op

A well-formed, well-signed event is always accepted. The gateway never rejects an
event on business grounds (a finding is a finding even when inconvenient). A broken
chain or a bad signature rejects the whole batch and flags the device.

## Endpoints

| Method + path | Purpose |
|---|---|
| `POST /v1/sync/events` | Push a batch of device-signed events (idempotent) |
| `POST /v1/sync/evidence` | Upload one evidence file; server recomputes the checksum then stores it write-once |
| `GET /v1/sync/pull?since=` | Pull server-authored events (decisions, escalations, registry updates) |
| `POST /v1/sync/bootstrap` | Pre-departure bundle: assigned facilities, in-force instruments, prior findings |
| `GET /health` | Liveness and database reachability |

## Run

```bash
cp .env.example .env          # set DATABASE_URL and AUTH_JWT_SECRET
pnpm --filter @agroassure/domain build   # build the shared domain first
pnpm --filter @agroassure/sync-gateway start:dev
```

## Auth (skeleton)

`DeviceAuthGuard` validates a bearer JWT (HS256) and attaches a verified principal.
A field-device token carries a `device_id` claim used to attribute field events. In
production, swap the HS256 check for the institution's OIDC provider; the guard is
the only place that needs to change.

Mint a test token:

```js
const jwt = require("jsonwebtoken");
const token = jwt.sign(
  { sub: "user-1", device_id: "018f...-dd", jurisdiction_id: "jx-kt", roles: ["inspector"] },
  process.env.AUTH_JWT_SECRET,
  { expiresIn: "12h" },
);
```

## What is real and what is stubbed

- Real: signature verification, hash-chain continuity, idempotent append, the
  content-addressed write-once evidence store (files are made read-only to emulate
  object-lock).
- Stubbed for the skeleton: evidence is uploaded as base64 in a JSON body rather than
  streamed multipart; the WORM guarantee is a local read-only file rather than S3
  object-lock in compliance mode. Both are noted in the code where they occur.

## Design note

`IngestService` depends on the `EventStorePort` interface, not on PostgreSQL, so its
verification logic is unit-tested with real cryptography and no database (see
`test/ingest.spec.ts`). The pg-backed implementation is `PgEventStore`.
