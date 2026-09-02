# @agroassure/db

PostgreSQL schema for AgroAssure: reference data, an append-only event store, and
rebuildable projections. Requires PostgreSQL 16+ with the `postgis` and `pgcrypto`
extensions available.

## Layout

- `migrations/0001_extensions_and_org.sql` - extensions, jurisdictions, authorities, users, roles, devices
- `migrations/0002_content_instruments.sql` - instruments, versions, sections, checkpoints (bilingual)
- `migrations/0003_event_store.sql` - append-only event store, per-device chain head, projection cursor
- `migrations/0004_projections.sql` - facility, inspection, responses, evidence, findings, decisions, certificates
- `migrations/0005_public_verification.sql` - the positive-only public view and its narrowly granted role
- `seed/0001_seed_katsina.sql` - optional pilot fixture

## Run

```bash
export DATABASE_URL=postgres://agroassure:agroassure@localhost:5432/agroassure
node migrate.mjs           # apply pending migrations (forward-only, tracked)
node migrate.mjs --seed    # also apply the optional pilot seed
```

The runner records applied files in `schema_migrations` and skips them next time.
Each migration wraps itself in a transaction, so a failure rolls that file back.

## Enforced invariants worth knowing

- `event_store` blocks `UPDATE` and `DELETE` via triggers. It is the system of record.
- `certificate.authorising_officer_id` and `certificate.decision_id` are `NOT NULL`,
  so a certificate cannot exist without a named officer and a recorded decision.
- `public_verify_role` is granted `SELECT` on `public_certificate_view` only.
