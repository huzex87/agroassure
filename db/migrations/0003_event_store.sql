-- 0003 - append-only event store, per-device chain head, projection cursor.
-- The event store is the system of record. UPDATE and DELETE are blocked.
BEGIN;

CREATE TABLE event_store (
    event_id        uuid PRIMARY KEY,
    aggregate_type  text NOT NULL,
    aggregate_id    uuid NOT NULL,
    seq             bigint NOT NULL,
    event_type      text NOT NULL,
    payload         jsonb NOT NULL,
    actor_user_id   uuid REFERENCES app_user(id),
    device_id       uuid REFERENCES device(id),
    hlc             text NOT NULL,
    prev_hash       bytea,
    event_hash      bytea NOT NULL,
    device_sig      bytea,
    recorded_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (aggregate_type, aggregate_id, seq)
);
CREATE INDEX ev_by_aggregate ON event_store (aggregate_type, aggregate_id, seq);
CREATE INDEX ev_by_device    ON event_store (device_id, recorded_at);
CREATE INDEX ev_by_type      ON event_store (event_type, recorded_at);
CREATE INDEX ev_by_recorded  ON event_store (recorded_at, event_id);

CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'event_store is append-only'; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_update BEFORE UPDATE ON event_store
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER no_delete BEFORE DELETE ON event_store
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- Server-side head of each device's hash chain (last accepted event_hash).
CREATE TABLE device_chain_head (
    device_id       uuid PRIMARY KEY REFERENCES device(id),
    last_event_hash bytea,
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Progress marker for each projection worker.
CREATE TABLE projection_cursor (
    projection_name  text PRIMARY KEY,
    last_recorded_at timestamptz NOT NULL DEFAULT '-infinity',
    last_event_id    uuid
);

COMMIT;
