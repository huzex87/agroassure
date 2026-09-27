-- Signing in to the console with a link sent by email.
--
-- A regulator's staff should not need an identity provider bought, hosted and
-- configured before they can use the console. A person the administrator has
-- added types their work email; the platform emails them a link that works
-- once, for fifteen minutes. Holding the inbox is the proof — which is also
-- what "forgot password" comes down to on any system that has passwords, so
-- nothing is weaker for there being none to guess, reuse or leak.
--
-- Only a hash of the link's token is stored: a live link is a credential, and
-- a database dump must not be a stack of them.

BEGIN;

CREATE TABLE sign_in_link (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES app_user(id),
    token_hash  text NOT NULL UNIQUE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz NOT NULL,
    used_at     timestamptz,
    CHECK (expires_at > created_at)
);

CREATE INDEX sign_in_link_user_idx ON sign_in_link (user_id, created_at DESC);

COMMIT;
