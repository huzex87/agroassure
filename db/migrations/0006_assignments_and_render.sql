-- 0006 - assignments (planning), certificate render artefact, instrument guards.
BEGIN;

-- Planned inspections. The risk engine proposes; a human schedules, and the
-- reason string travels with the assignment (principle P6).
CREATE TABLE assignment (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    jurisdiction_id     uuid NOT NULL REFERENCES jurisdiction(id),
    facility_id         uuid NOT NULL REFERENCES facility(id),
    assigned_to_user_id uuid NOT NULL REFERENCES app_user(id),
    created_by_user_id  uuid NOT NULL REFERENCES app_user(id),
    kind                text NOT NULL
        CHECK (kind IN ('routine','risk_targeted','follow_up')),
    reason              text,       -- why this facility, in words
    due_by              date,
    status              text NOT NULL DEFAULT 'planned'
        CHECK (status IN ('planned','in_progress','completed','cancelled')),
    inspection_id       uuid REFERENCES inspection(id),
    created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assignment_by_user     ON assignment (assigned_to_user_id, status, due_by);
CREATE INDEX assignment_by_facility ON assignment (facility_id, status);

-- The rendered PDF is an artefact of the certificate, not part of its identity.
ALTER TABLE certificate ADD COLUMN pdf_object_key text;
ALTER TABLE certificate ADD COLUMN rendered_at    timestamptz;

-- An inspection authored against a version superseded mid-day is recorded as
-- worked and flagged for the supervisor, never rejected (guide 11.3).
ALTER TABLE inspection ADD COLUMN version_discrepancy boolean NOT NULL DEFAULT false;

-- At most one version of an instrument may be in force at a time.
CREATE UNIQUE INDEX instrument_version_one_in_force
    ON instrument_version (instrument_id) WHERE status = 'in_force';

COMMIT;
