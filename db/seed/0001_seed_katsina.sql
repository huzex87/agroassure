-- Optional pilot fixture. Safe to skip and safe to re-run. Creates the Katsina
-- jurisdiction, an issuing authority, and one agro-dealer instrument shell.
BEGIN;

INSERT INTO jurisdiction (name, code)
VALUES ('Katsina State', 'KT')
ON CONFLICT (code) DO NOTHING;

INSERT INTO issuing_authority (jurisdiction_id, display_name, legal_name)
SELECT j.id, 'Mandated regulator', 'Farm Input Support Services, Katsina State'
FROM jurisdiction j
WHERE j.code = 'KT'
  AND NOT EXISTS (
    SELECT 1 FROM issuing_authority a WHERE a.jurisdiction_id = j.id
  );

INSERT INTO instrument (jurisdiction_id, facility_type, name)
SELECT j.id, 'agro_dealer', 'Agro-Dealer Warehouse Inspection'
FROM jurisdiction j
WHERE j.code = 'KT'
  AND NOT EXISTS (
    SELECT 1 FROM instrument i
    WHERE i.jurisdiction_id = j.id AND i.facility_type = 'agro_dealer'
  );

COMMIT;
