-- 0005 - public verification boundary. The public role reads exactly one view;
-- adverse data (findings, decisions, evidence, remarks) is not reachable.
BEGIN;

CREATE OR REPLACE VIEW public_certificate_view AS
SELECT c.verification_token,
       c.serial,
       f.name               AS business_name,
       f.licence_number,
       f.facility_type,
       f.lga,
       i.submitted_at::date AS last_inspected,
       c.rating_band,
       c.valid_to,
       a.display_name       AS issuing_authority
FROM certificate c
JOIN facility f          ON f.id = c.facility_id
JOIN inspection i        ON i.id = c.inspection_id
JOIN issuing_authority a ON a.id = c.issuing_authority_id
WHERE c.status = 'valid'
  AND c.valid_to >= current_date;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'public_verify_role') THEN
        CREATE ROLE public_verify_role NOLOGIN;
    END IF;
END $$;

GRANT SELECT ON public_certificate_view TO public_verify_role;
-- public_verify_role is granted nothing else. Do not add table grants here.

COMMIT;
