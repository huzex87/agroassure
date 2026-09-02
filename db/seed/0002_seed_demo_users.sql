BEGIN;

-- Demo staff for a shared preview deployment.
--
-- These are fictional people, and they exist so a reviewer can sign in and see
-- the console do its work. They carry no oidc_subject, because there is no
-- identity provider yet: tokens for them are minted with the CLI against
-- AUTH_JWT_SECRET. When the institution's OIDC provider is wired in, these rows
-- are the ones to delete.
--
-- The separation between them is the point, not decoration. The officer who
-- authorises a certificate is not the inspector who conducted the visit, and no
-- one row holds both roles — the certificate invariant depends on those being
-- two different people, so the demo must not quietly collapse them.

INSERT INTO app_user (id, jurisdiction_id, full_name, email, phone)
SELECT
  v.id::uuid, j.id, v.full_name, v.email, v.phone
FROM jurisdiction j
CROSS JOIN (VALUES
  ('018f1000-0000-7000-8000-000000000001', 'Aisha Bello',      'aisha.bello@demo.agroassure.ng',    '+2348000000001'),
  ('018f1000-0000-7000-8000-000000000002', 'Sani Musa',        'sani.musa@demo.agroassure.ng',      '+2348000000002'),
  ('018f1000-0000-7000-8000-000000000003', 'Hauwa Lawal',      'hauwa.lawal@demo.agroassure.ng',    '+2348000000003'),
  ('018f1000-0000-7000-8000-000000000004', 'Ibrahim Danjuma',  'ibrahim.danjuma@demo.agroassure.ng','+2348000000004'),
  ('018f1000-0000-7000-8000-000000000005', 'Ngozi Okeke',      'ngozi.okeke@demo.agroassure.ng',    '+2348000000005')
) AS v(id, full_name, email, phone)
WHERE j.code = 'KT'
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_role (user_id, role_code, jurisdiction_id)
SELECT v.user_id::uuid, v.role_code, j.id
FROM jurisdiction j
CROSS JOIN (VALUES
  ('018f1000-0000-7000-8000-000000000001', 'inspector'),
  ('018f1000-0000-7000-8000-000000000002', 'inspector'),
  ('018f1000-0000-7000-8000-000000000003', 'desk_supervisor'),
  ('018f1000-0000-7000-8000-000000000004', 'authorising_officer'),
  ('018f1000-0000-7000-8000-000000000005', 'state_admin')
) AS v(user_id, role_code)
WHERE j.code = 'KT'
ON CONFLICT DO NOTHING;

COMMIT;
