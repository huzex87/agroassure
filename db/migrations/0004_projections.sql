-- 0004 - projections. Derived from events; rebuildable; never authoritative.
BEGIN;

CREATE TABLE facility (
    id                    uuid PRIMARY KEY,
    jurisdiction_id       uuid NOT NULL REFERENCES jurisdiction(id),
    licence_number        text NOT NULL,
    facility_type         text NOT NULL,
    name                  text NOT NULL,
    owner_contact         jsonb NOT NULL DEFAULT '{}',
    address               jsonb NOT NULL DEFAULT '{}',
    lga                   text,
    registered_point      geography(Point,4326),
    registered_accuracy_m numeric(6,1),
    registered_at         timestamptz,
    created_at            timestamptz NOT NULL DEFAULT now(),
    UNIQUE (jurisdiction_id, licence_number)
);
CREATE INDEX facility_by_type ON facility (jurisdiction_id, facility_type);
CREATE INDEX facility_by_lga  ON facility (jurisdiction_id, lga);

CREATE TABLE inspection (
    id                    uuid PRIMARY KEY,
    reference             text NOT NULL UNIQUE,
    facility_id           uuid NOT NULL REFERENCES facility(id),
    instrument_version_id uuid NOT NULL REFERENCES instrument_version(id),
    structure_hash        bytea NOT NULL,
    inspector_user_id     uuid NOT NULL REFERENCES app_user(id),
    device_id             uuid NOT NULL REFERENCES device(id),
    checkin_point         geography(Point,4326),
    checkin_accuracy_m    numeric(6,1),
    checkin_distance_m    numeric(8,1),
    checkin_flagged       boolean NOT NULL DEFAULT false,
    status                text NOT NULL DEFAULT 'in_progress'
        CHECK (status IN ('in_progress','submitted')),
    rating_percent        numeric(5,2),
    rating_band           text,
    findings_count        int NOT NULL DEFAULT 0,
    inspector_signed_at   timestamptz,
    facility_signed_at    timestamptz,
    facility_rep_name     text,
    submitted_at          timestamptz,
    created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inspection_by_facility ON inspection (facility_id, submitted_at DESC);

CREATE TABLE checkpoint_response (
    id             uuid PRIMARY KEY,
    inspection_id  uuid NOT NULL REFERENCES inspection(id),
    checkpoint_ref text NOT NULL,
    response       text NOT NULL CHECK (response IN ('yes','no','na')),
    remark         text,
    weight         int NOT NULL DEFAULT 1,
    recorded_hlc   text NOT NULL,
    UNIQUE (inspection_id, checkpoint_ref)
);

CREATE TABLE evidence (
    id             uuid PRIMARY KEY,
    inspection_id  uuid NOT NULL REFERENCES inspection(id),
    checkpoint_ref text NOT NULL,
    sha256         bytea NOT NULL,
    object_key     text NOT NULL,
    mime           text NOT NULL,
    captured_at    timestamptz NOT NULL,
    point          geography(Point,4326),
    accuracy_m     numeric(6,1),
    locked         boolean NOT NULL DEFAULT false,
    UNIQUE (inspection_id, sha256)
);

CREATE TABLE finding (
    id                     uuid PRIMARY KEY,
    reference              text NOT NULL UNIQUE,
    inspection_id          uuid NOT NULL REFERENCES inspection(id),
    checkpoint_response_id uuid REFERENCES checkpoint_response(id),
    checkpoint_ref         text NOT NULL,
    summary                text NOT NULL,
    severity               text NOT NULL CHECK (severity IN ('critical','major','minor')),
    owner_user_id          uuid REFERENCES app_user(id),
    owner_label            text,
    due_date               date,
    status                 text NOT NULL DEFAULT 'open'
        CHECK (status IN ('open','overdue','awaiting_verification','escalated','closed')),
    escalated_to           text,
    escalated_at           timestamptz,
    closure_submitted_at   timestamptz,
    closed_at              timestamptz,
    closed_by_user_id      uuid REFERENCES app_user(id),
    created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX finding_worklist      ON finding (status, severity, due_date);
CREATE INDEX finding_by_inspection ON finding (inspection_id);

CREATE TABLE decision (
    id            uuid PRIMARY KEY,
    inspection_id uuid NOT NULL REFERENCES inspection(id),
    officer_id    uuid NOT NULL REFERENCES app_user(id),
    decision_type text NOT NULL CHECK (decision_type IN
        ('accept','request_clarification','direct_follow_up','escalate','authorise_certificate')),
    basis         text,
    decided_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX decision_by_inspection ON decision (inspection_id, decided_at);

CREATE TABLE certificate (
    id                     uuid PRIMARY KEY,
    serial                 text NOT NULL UNIQUE,
    facility_id            uuid NOT NULL REFERENCES facility(id),
    inspection_id          uuid NOT NULL REFERENCES inspection(id),
    decision_id            uuid NOT NULL REFERENCES decision(id),
    authorising_officer_id uuid NOT NULL REFERENCES app_user(id),   -- INVARIANT
    issuing_authority_id   uuid NOT NULL REFERENCES issuing_authority(id),
    rating_band            text NOT NULL,
    rating_percent         numeric(5,2) NOT NULL,
    issued_on              date NOT NULL,
    valid_to               date NOT NULL,
    next_due_on            date NOT NULL,
    status                 text NOT NULL DEFAULT 'valid'
        CHECK (status IN ('valid','revoked','superseded')),
    verification_token     text NOT NULL UNIQUE,
    created_at             timestamptz NOT NULL DEFAULT now(),
    CHECK (valid_to > issued_on),
    CHECK (next_due_on > issued_on)
);
CREATE INDEX certificate_by_facility ON certificate (facility_id, status);

CREATE TABLE notification (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES app_user(id),
    kind        text NOT NULL,
    payload     jsonb NOT NULL,
    read_at     timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notification_unread ON notification (user_id, read_at);

COMMIT;
