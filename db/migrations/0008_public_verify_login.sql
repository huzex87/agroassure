-- A login the public surface can actually use.
--
-- 0005 created public_verify_role and granted it SELECT on one view. That is
-- the boundary, and it was correct as far as it went — but the role is NOLOGIN,
-- so PUBLIC_VERIFY_DATABASE_URL had nothing to connect as. Every deployment so
-- far has therefore left it unset and let the public endpoint share the
-- application's own connection, which is the whole thing the role exists to
-- prevent: a fault on the public surface reaching tables it should not know
-- about.
--
-- This adds the login member. The password is not set here, because a password
-- in a migration is a password in the repository — the deployment sets it once:
--
--   ALTER ROLE public_verify LOGIN PASSWORD '...';
--
-- and then PUBLIC_VERIFY_DATABASE_URL points at it. The gateway refuses to
-- start with APP_ENV=pilot until it does.

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'public_verify') THEN
        -- NOLOGIN until a password is set, so the role cannot be reached in the
        -- window between this migration and the deployment configuring it.
        CREATE ROLE public_verify NOLOGIN IN ROLE public_verify_role;
    END IF;
END $$;

-- Connecting is not reading. Without this the role authenticates and then fails
-- on the first query, which looks like an outage rather than a missing grant.
--
-- GRANT ... ON DATABASE takes a literal name, and the name differs between a
-- laptop, CI and the pilot, so it is interpolated rather than written down.
DO $$
BEGIN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO public_verify_role', current_database());
END $$;

GRANT USAGE ON SCHEMA public TO public_verify_role;

-- Said twice on purpose. A later migration that adds a table grants nothing to
-- this role by default, and this is the line that should stop anyone adding one:
-- public_verify_role reads public_certificate_view and nothing else, ever.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM public_verify_role;
GRANT SELECT ON public_certificate_view TO public_verify_role;

COMMIT;
