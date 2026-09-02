-- 0002 - instruments, versions, sections, checkpoints (bilingual).
BEGIN;

CREATE TABLE instrument (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    jurisdiction_id uuid NOT NULL REFERENCES jurisdiction(id),
    facility_type   text NOT NULL
        CHECK (facility_type IN ('agro_dealer','blending_plant','manufacturing','importer')),
    name            text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE instrument_version (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    instrument_id     uuid NOT NULL REFERENCES instrument(id),
    version_label     text NOT NULL,
    status            text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft','in_force','superseded')),
    effective_from    date,
    published_by      uuid REFERENCES app_user(id),
    published_at      timestamptz,
    satisfactory_min  numeric(5,2) NOT NULL DEFAULT 80,
    needs_improve_min numeric(5,2) NOT NULL DEFAULT 60,
    structure_hash    bytea NOT NULL DEFAULT '\x00',
    UNIQUE (instrument_id, version_label)
);

CREATE TABLE section (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    instrument_version_id uuid NOT NULL REFERENCES instrument_version(id),
    ordinal               int NOT NULL,
    title_en              text NOT NULL,
    title_ha              text NOT NULL,
    UNIQUE (instrument_version_id, ordinal)
);

CREATE TABLE checkpoint (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id        uuid NOT NULL REFERENCES section(id),
    ordinal           int NOT NULL,
    prompt_en         text NOT NULL,
    prompt_ha         text NOT NULL,
    weight            int NOT NULL DEFAULT 1,
    severity_on_fail  text NOT NULL DEFAULT 'minor'
        CHECK (severity_on_fail IN ('critical','major','minor')),
    allows_na         boolean NOT NULL DEFAULT true,
    UNIQUE (section_id, ordinal)
);

COMMIT;
