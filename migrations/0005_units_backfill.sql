-- 0005_units_backfill.sql
-- v1 schema, phase 2b: backfill the v1 unit/ownership/tenancy tables
-- from Phase 1's hoa_properties + pm_properties.
--
-- This migration is ADDITIVE. Phase 1 tables (hoa_properties,
-- pm_properties) are untouched — their rows stay, so existing v0 code
-- paths continue to work unchanged. Each Phase 1 row is mirrored as:
--   - one `units` row carrying the property's address + structure
--   - one `ownerships` row (HOA only — pm_properties don't model HOA
--     ownership; they're rented units owned by the landlord org itself)
--   - one `tenancies` row (PM only — if pm_properties.tenant_name is set)
--
-- The new `legacy_*_property_id` columns on `units` are the join column
-- v1 code uses to match a unit back to its Phase 1 row while both
-- schemas coexist. They become unused once a future migration drops
-- hoa_properties/pm_properties.
--
-- Idempotent. Safe to re-run. Each INSERT guards with NOT EXISTS so
-- rerunning never duplicates.

-- ─── New columns on `units` linking back to Phase 1 ──────────────────

ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS legacy_hoa_property_id uuid
    REFERENCES public.hoa_properties(id) ON DELETE SET NULL;

ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS legacy_pm_property_id uuid
    REFERENCES public.pm_properties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS units_legacy_hoa_idx
  ON public.units(legacy_hoa_property_id)
  WHERE legacy_hoa_property_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS units_legacy_pm_idx
  ON public.units(legacy_pm_property_id)
  WHERE legacy_pm_property_id IS NOT NULL;

-- ─── Backfill units from hoa_properties ──────────────────────────────
--
-- One unit per HOA property. Address fields land on the v1 column shape;
-- the Phase 1 schema didn't break address into line1/city/state/zip, so
-- everything goes into address_line1 and we leave the rest NULL until a
-- future cleanup parses them.

INSERT INTO public.units (
  organization_id,
  association_id,
  address_line1,
  unit_number,
  notes,
  legacy_hoa_property_id,
  created_at,
  updated_at
)
SELECT
  hp.org_id,
  a.id,
  hp.address,
  hp.unit_number,
  hp.notes,
  hp.id,
  hp.created_at,
  hp.updated_at
FROM public.hoa_properties hp
JOIN public.associations a ON a.organization_id = hp.org_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.units u WHERE u.legacy_hoa_property_id = hp.id
);

-- ─── Backfill units from pm_properties ───────────────────────────────
--
-- pm_properties carries some richer fields (bedrooms, bathrooms, sq_ft)
-- so we map those across too.

INSERT INTO public.units (
  organization_id,
  association_id,
  address_line1,
  bedrooms,
  bathrooms,
  square_feet,
  notes,
  legacy_pm_property_id,
  created_at,
  updated_at
)
SELECT
  pp.org_id,
  a.id,
  pp.address,
  pp.bedrooms,
  pp.bathrooms,
  pp.sq_ft,
  pp.notes,
  pp.id,
  pp.created_at,
  pp.updated_at
FROM public.pm_properties pp
JOIN public.associations a ON a.organization_id = pp.org_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.units u WHERE u.legacy_pm_property_id = pp.id
);

-- ─── Backfill ownerships (HOA owners) ────────────────────────────────
--
-- One open-ended ownership row per HOA property that has an owner
-- recorded. valid_from defaults to the property's created_at (when the
-- HOA started tracking the unit); valid_to NULL = "current owner".
-- Skipped when there's no owner_name (the row is meaningless without
-- it) or when an open ownership already exists for the unit.

INSERT INTO public.ownerships (
  organization_id,
  unit_id,
  owner_name,
  owner_email,
  owner_phone,
  ownership_pct,
  valid_from,
  source
)
SELECT
  hp.org_id,
  u.id,
  hp.owner_name,
  hp.owner_email,
  hp.owner_phone,
  100,
  COALESCE(hp.created_at::date, CURRENT_DATE),
  'phase1_backfill'
FROM public.hoa_properties hp
JOIN public.units u ON u.legacy_hoa_property_id = hp.id
WHERE hp.owner_name IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.ownerships o
    WHERE o.unit_id = u.id AND o.valid_to IS NULL
  );

-- ─── Backfill tenancies (PM leases) ──────────────────────────────────

INSERT INTO public.tenancies (
  organization_id,
  unit_id,
  tenant_name,
  tenant_email,
  tenant_phone,
  monthly_rent,
  deposit,
  lease_start,
  lease_end,
  status
)
SELECT
  pp.org_id,
  u.id,
  pp.tenant_name,
  pp.tenant_email,
  pp.tenant_phone,
  pp.monthly_rent,
  pp.deposit,
  COALESCE(pp.lease_start, pp.created_at::date),
  pp.lease_end,
  CASE
    WHEN pp.lease_end IS NULL OR pp.lease_end > CURRENT_DATE THEN 'active'
    ELSE 'ended'
  END
FROM public.pm_properties pp
JOIN public.units u ON u.legacy_pm_property_id = pp.id
WHERE pp.tenant_name IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.tenancies t
    WHERE t.unit_id = u.id AND t.status = 'active'
  );

-- ─── Sanity counts ───────────────────────────────────────────────────
-- After this runs, the following invariants should hold:
--   - Every hoa_properties row has a corresponding units row
--   - Every pm_properties row has a corresponding units row
--   - Every hoa_properties row with owner_name has an open ownership
--   - Every pm_properties row with tenant_name has an active tenancy
--
-- Run this to verify (read-only):
--
-- SELECT
--   (SELECT COUNT(*) FROM hoa_properties)       AS hoa_props,
--   (SELECT COUNT(*) FROM units WHERE legacy_hoa_property_id IS NOT NULL) AS hoa_units,
--   (SELECT COUNT(*) FROM pm_properties)        AS pm_props,
--   (SELECT COUNT(*) FROM units WHERE legacy_pm_property_id IS NOT NULL)  AS pm_units,
--   (SELECT COUNT(*) FROM ownerships WHERE valid_to IS NULL)              AS active_owners,
--   (SELECT COUNT(*) FROM tenancies WHERE status = 'active')              AS active_tenancies;
