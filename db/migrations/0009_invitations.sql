-- Invitations: how an inspector's phone joins the platform.
--
-- The old path took two people and a wait. A phone generated a key, asked to be
-- enrolled, and sat on "waiting for approval" until an administrator happened
-- to open the console. The administrator's decision was real, but it was made
-- at the wrong moment — after the phone existed, while someone stood holding it.
--
-- An invitation moves that decision earlier. The administrator names the person
-- and the platform issues a one-time code, sent by email and SMS. Entering the
-- code on a phone is the approval: the phone's key is registered active in the
-- same transaction that spends the code. Nobody waits, and nobody but an
-- administrator can bring a phone into service.
--
-- Only a hash of the code is stored. The code is a bearer credential for as long
-- as it is live; a database dump must not be a list of working ones.

BEGIN;

CREATE TABLE invitation (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    jurisdiction_id  uuid REFERENCES jurisdiction(id),
    user_id          uuid NOT NULL REFERENCES app_user(id),
    code_hash        text NOT NULL UNIQUE,
    created_by       uuid NOT NULL REFERENCES app_user(id),
    created_at       timestamptz NOT NULL DEFAULT now(),
    expires_at       timestamptz NOT NULL,
    used_at          timestamptz,
    used_device_id   uuid REFERENCES device(id),
    cancelled_at     timestamptz,
    -- Delivery is recorded per channel, so the console can say "sent by SMS,
    -- email failed" instead of leaving an administrator to guess which one
    -- the inspector should be looking at.
    email_to         text,
    email_status     text CHECK (email_status IN ('sent', 'failed', 'skipped')),
    email_detail     text,
    sms_to           text,
    sms_status       text CHECK (sms_status IN ('sent', 'failed', 'skipped')),
    sms_detail       text,
    -- A code is spent once. Both columns move together or not at all.
    CHECK ((used_at IS NULL) = (used_device_id IS NULL)),
    CHECK (expires_at > created_at)
);

CREATE INDEX invitation_user_idx ON invitation (user_id, created_at DESC);

-- One live invitation per person. Sending a new code retires the old one, so
-- there is never a question of which of three codes in someone's inbox works.
CREATE UNIQUE INDEX invitation_one_live_per_user
    ON invitation (user_id)
    WHERE used_at IS NULL AND cancelled_at IS NULL;

-- When a phone last talked to the server, so "is this phone still in use?"
-- has an answer on the Team page.
ALTER TABLE device ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

COMMIT;
