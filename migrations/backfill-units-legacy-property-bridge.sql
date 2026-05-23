-- backfill-units-legacy-property-bridge.sql
--
-- units.legacy_hoa_property_id is the bridge column that connects the
-- newer `units` table (which has association_id) to the legacy
-- `hoa_properties` table (which has the `tenure` column the lease
-- widget reads). When the CSV import inserted units, this column was
-- left NULL. When the mirror SQL inserted hoa_properties rows from
-- units, it also didn't set the bridge.
--
-- Result: the lease widget queries
--   units WHERE association_id IN (…) AND legacy_hoa_property_id IS NOT NULL
-- and gets 0 rows even though 50 units + 50 hoa_properties exist.
--
-- This backfill matches units → hoa_properties by (org, address) — the
-- same key used by the mirror SQL — and writes the resulting id back
-- into units.legacy_hoa_property_id. Idempotent: re-runs the same row
-- assignment (or no-ops if already set).
--
-- USAGE — replace <ORG_ID> if running for another tenant.

UPDATE public.units u
   SET legacy_hoa_property_id = hp.id
  FROM public.hoa_properties hp
 WHERE u.organization_id = hp.org_id
   AND u.address_line1   = hp.address
   AND hp.deleted_at IS NULL
   AND u.organization_id = 'a4906f16-baf3-4232-a2bd-a78ea432ad86'
   AND u.legacy_hoa_property_id IS DISTINCT FROM hp.id;

-- Verification:
--   SELECT COUNT(*) AS bridged
--     FROM public.units
--    WHERE organization_id = 'a4906f16-baf3-4232-a2bd-a78ea432ad86'
--      AND legacy_hoa_property_id IS NOT NULL;
--   -- Expect: 50 (matching the units count)
