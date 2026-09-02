-- 0007 - assignments must not hold foreign keys into projections.
--
-- A projection is disposable by design: it is dropped and replayed from the
-- event store whenever a read model needs rebuilding. `assignment` is not a
-- projection — it is durable planning data, authored in the console and never
-- derived from an event — so a foreign key from it into `facility` or
-- `inspection` makes those projections undroppable, and rebuild() failed on any
-- jurisdiction that had ever scheduled a visit.
--
-- The columns stay, and so does every reference into org and reference data
-- (jurisdiction, app_user), which are not projections and are safe to depend
-- on. What goes is the constraint pointing the wrong way: from something
-- durable to something rebuildable.
--
-- The trade is explicit: an assignment could in principle name a facility that
-- no event has produced. Facility ids come from the event that registered them,
-- so a rebuild restores every one of them under the same id, and the console's
-- joins are inner joins, so a genuinely dangling assignment simply does not
-- appear rather than showing a half-row.

BEGIN;

ALTER TABLE assignment DROP CONSTRAINT IF EXISTS assignment_facility_id_fkey;
ALTER TABLE assignment DROP CONSTRAINT IF EXISTS assignment_inspection_id_fkey;

COMMENT ON COLUMN assignment.facility_id IS
  'References facility(id) by value, not by constraint: facility is a rebuildable projection.';
COMMENT ON COLUMN assignment.inspection_id IS
  'References inspection(id) by value, not by constraint: inspection is a rebuildable projection.';

COMMIT;
