-- 0001 - extensions, jurisdictions, authorities, users, roles, devices.
BEGIN;

CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE jurisdiction (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    code        text NOT NULL UNIQUE,
    parent_id   uuid REFERENCES jurisdiction(id),
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE issuing_authority (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    jurisdiction_id uuid NOT NULL REFERENCES jurisdiction(id),
    display_name    text NOT NULL,
    legal_name      text NOT NULL,
    mark_asset_url  text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app_user (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    jurisdiction_id uuid REFERENCES jurisdiction(id),
    full_name       text NOT NULL,
    email           text UNIQUE,
    phone           text,
    oidc_subject    text UNIQUE,
    status          text NOT NULL DEFAULT 'active',
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE role (
    code  text PRIMARY KEY,
    label text NOT NULL
);
INSERT INTO role (code, label) VALUES
    ('inspector', 'Inspector'),
    ('desk_supervisor', 'Desk Supervisor'),
    ('authorising_officer', 'Authorising Officer'),
    ('state_admin', 'State Administrator'),
    ('national_admin', 'National Administrator'),
    ('auditor', 'Auditor');

CREATE TABLE user_role (
    user_id         uuid NOT NULL REFERENCES app_user(id),
    role_code       text NOT NULL REFERENCES role(code),
    jurisdiction_id uuid REFERENCES jurisdiction(id),
    PRIMARY KEY (user_id, role_code, jurisdiction_id)
);

CREATE TABLE device (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    jurisdiction_id  uuid NOT NULL REFERENCES jurisdiction(id),
    assigned_user_id uuid REFERENCES app_user(id),
    public_key       bytea NOT NULL,          -- ed25519 SPKI/raw public key
    label            text,
    status           text NOT NULL DEFAULT 'active',
    enrolled_at      timestamptz NOT NULL DEFAULT now(),
    revoked_at       timestamptz
);

COMMIT;
