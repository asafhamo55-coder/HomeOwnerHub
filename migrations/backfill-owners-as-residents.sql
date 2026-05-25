-- backfill-owners-as-residents.sql
--
-- The CSV import created `ownerships` rows (with owner_name + email +
-- phone) under the newer multi-association model, but never created
-- matching `property_residents` rows under the legacy email-keyed
-- model. Result: /properties/[id] (which reads property_residents)
-- shows "no residents yet" for every Madison Park lot even though
-- the ownership data is there.
--
-- This backfill walks ownerships → units → hoa_properties (via
-- units.legacy_hoa_property_id) and writes the same owner data into
-- property_residents.
--
-- Idempotent: NOT EXISTS guard on (org, property, lower(email)) skips
-- owners already present. Safe to re-run.
--
-- Scope: Madison Park org. Only ACTIVE ownerships (valid_to IS NULL).

INSERT INTO public.property_residents
  (organization_id, property_id, full_name, email, phone, role,
   is_primary, moved_in_at)
SELECT
  o.organization_id,
  u.legacy_hoa_property_id,
  COALESCE(o.owner_name, split_part(o.owner_email, '@', 1), 'Owner'),
  o.owner_email,
  o.owner_phone,
  'owner',
  -- First owner on each unit is marked primary; subsequent owners are not.
  -- ROW_NUMBER picks one deterministically by valid_from.
  (ROW_NUMBER() OVER (PARTITION BY u.legacy_hoa_property_id
                      ORDER BY o.valid_from, o.id)) = 1,
  o.valid_from
FROM public.ownerships o
JOIN public.units u ON u.id = o.unit_id
WHERE o.organization_id = 'a4906f16-baf3-4232-a2bd-a78ea432ad86'
  AND o.valid_to IS NULL
  AND u.legacy_hoa_property_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.property_residents pr
    WHERE pr.organization_id = o.organization_id
      AND pr.property_id = u.legacy_hoa_property_id
      AND lower(COALESCE(pr.email, '')) = lower(COALESCE(o.owner_email, ''))
      AND pr.moved_out_at IS NULL
  );

-- Verify:
--   SELECT COUNT(*) AS owner_residents
--     FROM public.property_residents
--    WHERE organization_id = 'a4906f16-baf3-4232-a2bd-a78ea432ad86'
--      AND role = 'owner'
--      AND moved_out_at IS NULL;
--   -- Expect: close to 57 (your ownerships count) minus any that already
--   -- had matching property_residents rows from the earlier hamofamily5
--   -- invite or other manual additions.
--
-- Spot-check a multi-owner unit:
--   SELECT hp.address, pr.full_name, pr.email, pr.is_primary
--     FROM public.property_residents pr
--     JOIN public.hoa_properties hp ON hp.id = pr.property_id
--    WHERE pr.organization_id = 'a4906f16-baf3-4232-a2bd-a78ea432ad86'
--      AND hp.address ILIKE '%3573 Old Maple%'   -- Lot #1 in the CSV
--    ORDER BY pr.is_primary DESC, pr.full_name;
