-- mirror-units-to-hoa-properties.sql
--
-- The HOA app has two property-shaped tables that grew up at different
-- times and haven't been unified yet:
--   - hoa_properties (migration 0000) — what /properties (list page)
--     reads. Carries owner_name/email/phone denormalized inline.
--   - units (migration 0004) — the newer multi-association model.
--     Referenced by ownerships, tenancies, assessments, communications.
--
-- This migration mirrors rows from `units` into `hoa_properties` so
-- data loaded via the new /admin/import-units page is visible in the
-- legacy list. Idempotent (NOT EXISTS guard).
--
-- Owner fields come from the CURRENT ownership (valid_to IS NULL). If
-- a unit has multiple current owners (common — Lot #1 has 4), they
-- are aggregated with ' · ' (names) / ', ' (emails, phones).
--
-- After running this, /properties will show the imported units. The
-- `tenure` column is left NULL — that's fine, they show under
-- "Unknown" in the filter chips. Set tenure manually if you want
-- proper owner-occupied / leased categorization.
--
-- USAGE — replace <ORG_ID> with the org you imported into. Re-runnable.

WITH current_owners AS (
  SELECT
    o.unit_id,
    string_agg(DISTINCT o.owner_name,  ' · ' ORDER BY o.owner_name)  AS owner_name,
    string_agg(DISTINCT o.owner_email, ', ' ORDER BY o.owner_email) AS owner_email,
    string_agg(DISTINCT o.owner_phone, ', ' ORDER BY o.owner_phone) AS owner_phone
  FROM public.ownerships o
  WHERE o.valid_to IS NULL
    AND o.organization_id = 'a4906f16-baf3-4232-a2bd-a78ea432ad86'
    AND o.owner_name IS NOT NULL
  GROUP BY o.unit_id
)
INSERT INTO public.hoa_properties
  (org_id, address, unit_number, owner_name, owner_email, owner_phone, notes)
SELECT
  u.organization_id,
  u.address_line1,
  u.unit_number,
  co.owner_name,
  co.owner_email,
  co.owner_phone,
  u.notes
FROM public.units u
LEFT JOIN current_owners co ON co.unit_id = u.id
WHERE u.organization_id = 'a4906f16-baf3-4232-a2bd-a78ea432ad86'
  AND NOT EXISTS (
    SELECT 1
      FROM public.hoa_properties hp
     WHERE hp.org_id = u.organization_id
       AND hp.address = u.address_line1
       AND hp.deleted_at IS NULL
  );
-- PREREQ: migration 0022_soft_delete.sql must be applied first
-- (it adds deleted_at to hoa_properties + other tables).

-- Verification:
--   SELECT COUNT(*) FROM public.hoa_properties
--    WHERE org_id = 'a4906f16-baf3-4232-a2bd-a78ea432ad86'
--      AND deleted_at IS NULL;
--   -- Expect: ~48 (your CSV row count), possibly higher if rows
--   --         existed before your import.
