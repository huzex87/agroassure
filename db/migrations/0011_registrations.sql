-- People asking to join, before anyone has said yes.
--
-- Invitations start with the administrator. A registration starts with the
-- person: they give their name, email, phone and state, prove the email and
-- phone are theirs with a code sent to each, and then wait. Nobody gets
-- anything until an administrator approves them and chooses their role, so
-- registration is a way of asking, not a way in.
--
-- A registration from the phone app carries the public half of that phone's
-- signing key. Approving it registers the key as the new inspector's active
-- phone in the same transaction, so the phone that asked is the phone that
-- works — no invite code in between.
--
-- Codes and the registrant's status token are stored as hashes only.

BEGIN;

CREATE TABLE registration (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    jurisdiction_id    uuid NOT NULL REFERENCES jurisdiction(id),
    full_name          text NOT NULL,
    email              text NOT NULL,
    phone              text NOT NULL,
    -- What they are asking to do. The administrator decides the role.
    kind               text NOT NULL CHECK (kind IN ('inspector', 'office')),
    -- Where they registered: the phone app, or the console website.
    source             text NOT NULL CHECK (source IN ('app', 'console')),
    public_key         bytea,
    -- A secret only the registrant holds, for checking on their request.
    status_token_hash  text NOT NULL UNIQUE,

    email_code_hash    text,
    sms_code_hash      text,
    codes_sent_at      timestamptz,
    codes_sent_count   int NOT NULL DEFAULT 0,
    code_attempts      int NOT NULL DEFAULT 0,
    email_verified_at  timestamptz,
    phone_verified_at  timestamptz,

    status             text NOT NULL DEFAULT 'verifying'
        CHECK (status IN ('verifying', 'pending', 'approved', 'rejected', 'withdrawn')),
    decided_by         uuid REFERENCES app_user(id),
    decided_at         timestamptz,
    decided_role       text REFERENCES role(code),
    reject_reason      text,
    user_id            uuid REFERENCES app_user(id),
    device_id          uuid REFERENCES device(id),
    created_at         timestamptz NOT NULL DEFAULT now(),

    -- Only an app registration can bring a phone, and only as a 32-byte key.
    CHECK (public_key IS NULL OR (source = 'app' AND length(public_key) = 32)),
    -- Pending means both contacts were proven.
    CHECK (status NOT IN ('pending', 'approved') OR (email_verified_at IS NOT NULL AND phone_verified_at IS NOT NULL)),
    -- A decision names who made it.
    CHECK (status NOT IN ('approved', 'rejected') OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
    CHECK (status <> 'approved' OR (user_id IS NOT NULL AND decided_role IS NOT NULL))
);

CREATE INDEX registration_queue ON registration (jurisdiction_id, status, created_at);

-- One open request per email address: asking again replaces the old one.
CREATE UNIQUE INDEX registration_one_open_per_email
    ON registration (lower(email))
    WHERE status IN ('verifying', 'pending');

COMMIT;
