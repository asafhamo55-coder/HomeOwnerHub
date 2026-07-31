-- 0028_property_bridge_backfill.sql
--
-- Replaces migrations/backfill-units-legacy-property-bridge.sql, which was
-- hardcoded to a single org id and matched addresses with exact string
-- equality. Any tenant onboarded after Madison Park got
-- units.legacy_hoa_property_id = NULL, and any "St" vs "St." difference
-- never bridged at all.
--
-- The bridge matters because the two property tables carry different
-- things the shared inbox needs at the same time:
--   hoa_properties → property_residents.email  (who is writing to us)
--   units          → tickets/arc/communications (what we link mail to)
--
-- public.normalize_address() is the SQL TWIN of normalizeAddress() in
-- apps/hoa/src/lib/properties/normalize-address.ts. The two MUST agree.
-- Changing one without the other makes rows that bridged at migration
-- time stop matching at runtime.
--
-- Idempotent. Safe to re-run.

-- ─── normalize_address ───────────────────────────────────────────────
-- WARNING: This function is IMMUTABLE and is used in functional indexes
-- (units_norm_address_idx, hoa_properties_norm_address_idx). PostgreSQL
-- does NOT recompute existing index entries when the function is redefined
-- via CREATE OR REPLACE. Any change here silently corrupts the indexes —
-- they will return rows computed under the old definition while the function
-- returns new values. To prevent silent mismatches, any migration that
-- modifies this function MUST include these two statements in the SAME
-- migration (idempotent; safe to re-run):
--   REINDEX INDEX CONCURRENTLY units_norm_address_idx;
--   REINDEX INDEX CONCURRENTLY hoa_properties_norm_address_idx;
-- Omitting these will cause addresses to stop matching at runtime.
CREATE OR REPLACE FUNCTION public.normalize_address(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  cleaned  text;
  parts    text[];
  last_tok text;
  short    text;
BEGIN
  IF raw IS NULL THEN RETURN ''; END IF;

  -- 1. lowercase  2. non-alphanumeric → space  3. collapse  4. trim
  -- Note: POSIX [:space:] matches ASCII space/tab/newline only, not Unicode
  -- spaces (e.g., non-breaking space). The TypeScript twin uses \s, which
  -- includes Unicode. For real street addresses this divergence is negligible,
  -- but it exists; see apps/hoa/src/lib/properties/normalize-address.ts.
  cleaned := btrim(regexp_replace(
               regexp_replace(lower(raw), '[^a-z0-9[:space:]]', ' ', 'g'),
               '\s+', ' ', 'g'));

  IF cleaned = '' THEN RETURN ''; END IF;

  parts    := string_to_array(cleaned, ' ');
  last_tok := parts[array_length(parts, 1)];

  short := CASE last_tok
    WHEN 'street' THEN 'st'    WHEN 'st'   THEN 'st'
    WHEN 'lane'   THEN 'ln'    WHEN 'ln'   THEN 'ln'
    WHEN 'court'  THEN 'ct'    WHEN 'ct'   THEN 'ct'
    WHEN 'drive'  THEN 'dr'    WHEN 'dr'   THEN 'dr'
    WHEN 'road'   THEN 'rd'    WHEN 'rd'   THEN 'rd'
    WHEN 'avenue' THEN 'ave'   WHEN 'ave'  THEN 'ave'  WHEN 'av' THEN 'ave'
    WHEN 'boulevard' THEN 'blvd' WHEN 'blvd' THEN 'blvd'
    WHEN 'circle' THEN 'cir'   WHEN 'cir'  THEN 'cir'
    WHEN 'place'  THEN 'pl'    WHEN 'pl'   THEN 'pl'
    WHEN 'terrace' THEN 'ter'  WHEN 'ter'  THEN 'ter'
    WHEN 'trail'  THEN 'trl'   WHEN 'trl'  THEN 'trl'
    WHEN 'way'    THEN 'way'
    ELSE NULL
  END;

  IF short IS NOT NULL THEN
    parts[array_length(parts, 1)] := short;
  END IF;

  RETURN array_to_string(parts, ' ');
END;
$$;

-- ─── functional indexes ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS units_norm_address_idx
  ON public.units (organization_id, public.normalize_address(address_line1));

CREATE INDEX IF NOT EXISTS hoa_properties_norm_address_idx
  ON public.hoa_properties (org_id, public.normalize_address(address));

-- ─── backfill: ALL orgs, normalized matching ─────────────────────────
-- Only bridges where normalization yields exactly ONE candidate on the
-- other side. Ambiguous matches (two hoa_properties normalizing to the
-- same address within one org) are left NULL and reported by the
-- property_bridge_gaps view below — guessing would silently misfile mail.
UPDATE public.units u
   SET legacy_hoa_property_id = hp.id
  FROM public.hoa_properties hp
 WHERE u.organization_id = hp.org_id
   AND hp.deleted_at IS NULL
   AND public.normalize_address(u.address_line1) = public.normalize_address(hp.address)
   AND public.normalize_address(u.address_line1) <> ''
   AND u.legacy_hoa_property_id IS DISTINCT FROM hp.id
   -- Uniqueness check: only one hoa_property must normalize to this unit's
   -- address within the same org. This is intentional — multiple units CAN
   -- share a single hoa_property row (e.g., unit 101 and 102 both at one
   -- address). We just prevent confusion by not guessing which hoa_property
   -- a unit belongs to if there are multiple candidates on the property side.
   AND (
     SELECT count(*) FROM public.hoa_properties hp2
      WHERE hp2.org_id = u.organization_id
        AND hp2.deleted_at IS NULL
        AND public.normalize_address(hp2.address)
            = public.normalize_address(u.address_line1)
   ) = 1;

-- ─── gap reporting, both directions ──────────────────────────────────
CREATE OR REPLACE VIEW public.property_bridge_gaps AS
  SELECT
    u.organization_id,
    'unit_unbridged'::text AS gap_kind,
    u.id                   AS record_id,
    u.address_line1        AS address
  FROM public.units u
  WHERE u.legacy_hoa_property_id IS NULL
UNION ALL
  SELECT
    hp.org_id,
    'property_unbridged'::text,
    hp.id,
    hp.address
  FROM public.hoa_properties hp
  WHERE hp.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.units u2
       WHERE u2.legacy_hoa_property_id = hp.id
    );

-- Verification (run manually after applying):
--   SELECT organization_id, gap_kind, count(*)
--     FROM public.property_bridge_gaps
--    GROUP BY 1, 2 ORDER BY 1, 2;
--   -- Madison Park (a4906f16-baf3-4232-a2bd-a78ea432ad86) expects 0 rows.
