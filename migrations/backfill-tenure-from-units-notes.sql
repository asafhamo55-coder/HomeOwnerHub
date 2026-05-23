-- backfill-tenure-from-units-notes.sql
--
-- The CSV import wrote occupancy_type (owner_occupied / rental) into
-- units.notes as text — e.g. "Single Family · occupancy: rental · …".
-- The dashboard / lease stats read from hoa_properties.tenure, which
-- was left NULL.
--
-- This backfills hoa_properties.tenure from the occupancy substring
-- in the matching unit's notes. Mapping:
--   'rental'         → 'leased'
--   'owner_occupied' → 'owner_occupied'
--   anything else    → NULL (left as-is so the dashboard shows
--                            "Unknown" rather than guessing)
--
-- Re-runnable: pure UPDATE, no inserts.
--
-- USAGE — replace <ORG_ID> if running for a different tenant.

UPDATE public.hoa_properties hp
   SET tenure = CASE
     WHEN u.notes ILIKE '%occupancy: rental%'         THEN 'leased'
     WHEN u.notes ILIKE '%occupancy: owner_occupied%' THEN 'owner_occupied'
     ELSE NULL
   END
  FROM public.units u
 WHERE hp.org_id      = u.organization_id
   AND hp.address     = u.address_line1
   AND hp.deleted_at  IS NULL
   AND u.organization_id = 'a4906f16-baf3-4232-a2bd-a78ea432ad86';

-- Verification (run separately):
--   SELECT tenure, COUNT(*) FROM public.hoa_properties
--    WHERE org_id = 'a4906f16-baf3-4232-a2bd-a78ea432ad86'
--      AND deleted_at IS NULL
--    GROUP BY tenure;
--
-- Expected: a mix of 'owner_occupied' and 'leased' rows, possibly some
-- NULL for the pre-existing test row that wasn't from the CSV.
