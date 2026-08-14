-- update-madison-park-dues-aging-2026-07-21.sql
-- Reconciles Madison Park AR against the CINCSystems aging report
-- "Homeowner Aging Report Excluding Prepaid", End Date 07/21/2026.
--
-- Delta vs. the prior 5/27/2026 report seeded by
-- migrations/seed-madison-park-dues-aging.sql:
--
--   + Manpreet Kaur    Lien Filing Fee 2026        $175.00  (new, Over 30)
--   + Larry & Jacqueline Wilson
--                      Legal Fee - Collection 2026 $193.47  (new, Over 30)
--   - Javed M. Aswani  Delinquent Fee 2026          $55.00  (cleared -> paid)
--
-- Unchanged: Vishnupriya Kailasam ($47.80), Holly Stiehm Young ($49.50),
--            Haritha Tanneru ($1,435.00).
--
-- Association AR total after this run: $9,475.88
--   Kailasam    $47.80
--   Young       $49.50
--   Tanneru  $1,435.00
--   Kaur     $2,265.00
--   Wilson   $5,678.58
--
-- Idempotent: NOT EXISTS guard on (unit_id, assessment_type, due_date, amount).
-- Run from: https://supabase.com/dashboard/project/xwdjsxfskvreguyvryhc/sql/new

DO $$
DECLARE
  v_org_id   uuid := 'a4906f16-baf3-4232-a2bd-a78ea432ad86';
  v_assoc_id uuid;
  v_fp_id    uuid;
  v_unit_id  uuid;
  v_total    numeric;
BEGIN
  -- Resolve association
  SELECT id INTO v_assoc_id
  FROM public.associations
  WHERE organization_id = v_org_id
  LIMIT 1;

  IF v_assoc_id IS NULL THEN
    RAISE EXCEPTION 'No association found for Madison Park org';
  END IF;

  -- Resolve open fiscal period
  SELECT id INTO v_fp_id
  FROM public.fiscal_periods
  WHERE association_id = v_assoc_id AND status = 'open'
  ORDER BY start_date DESC
  LIMIT 1;

  IF v_fp_id IS NULL THEN
    RAISE EXCEPTION 'No open fiscal period found for Madison Park';
  END IF;

  -- ─── 1. Manpreet Kaur — 3580 Allee Elm Drive, Lot 26 ─────────────
  -- New charge since the 5/27 report. Collection Status: Lien Letter;
  -- lien letter went out 6/9/26, so the fee dates to that action.
  SELECT u.id INTO v_unit_id
  FROM public.units u
  JOIN public.hoa_properties hp ON hp.id = u.legacy_hoa_property_id
  WHERE u.organization_id = v_org_id AND hp.address ILIKE '%3580 Allee Elm%'
  LIMIT 1;

  IF v_unit_id IS NOT NULL THEN
    -- Lien Filing Fee 2026: $175.00
    INSERT INTO public.assessments (organization_id, association_id, unit_id, fiscal_period_id, assessment_type, amount, due_date, status)
    SELECT v_org_id, v_assoc_id, v_unit_id, v_fp_id, 'special', 175.00, '2026-06-09', 'open'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.assessments WHERE unit_id = v_unit_id AND assessment_type = 'special' AND amount = 175.00 AND due_date = '2026-06-09' AND deleted_at IS NULL
    );
  ELSE
    RAISE WARNING 'Unit not found: 3580 Allee Elm Drive (Manpreet Kaur)';
  END IF;

  -- ─── 2. Larry & Jacqueline Wilson — 3597 Old Maple Drive, Lot 45 ──
  -- New charge since the 5/27 report. Board authorized suit 5/29/26;
  -- D&D sent demand letter 6/1/26, which is when the 2026 legal fee hit.
  SELECT u.id INTO v_unit_id
  FROM public.units u
  JOIN public.hoa_properties hp ON hp.id = u.legacy_hoa_property_id
  WHERE u.organization_id = v_org_id AND hp.address ILIKE '%3597 Old Maple%'
  LIMIT 1;

  IF v_unit_id IS NOT NULL THEN
    -- Legal Fee - Collection 2026: $193.47
    INSERT INTO public.assessments (organization_id, association_id, unit_id, fiscal_period_id, assessment_type, amount, due_date, status)
    SELECT v_org_id, v_assoc_id, v_unit_id, v_fp_id, 'special', 193.47, '2026-06-01', 'open'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.assessments WHERE unit_id = v_unit_id AND assessment_type = 'special' AND amount = 193.47 AND due_date = '2026-06-01' AND deleted_at IS NULL
    );
  ELSE
    RAISE WARNING 'Unit not found: 3597 Old Maple Drive (Wilson)';
  END IF;

  -- ─── 3. Javed M. Aswani — 904 Urban Ash Court, Lot 37 ────────────
  -- Dropped off the 7/21 aging report entirely, so the $55.00
  -- delinquent fee seeded from the 5/27 report is no longer outstanding.
  SELECT u.id INTO v_unit_id
  FROM public.units u
  JOIN public.hoa_properties hp ON hp.id = u.legacy_hoa_property_id
  WHERE u.organization_id = v_org_id AND hp.address ILIKE '%904 Urban Ash%'
  LIMIT 1;

  IF v_unit_id IS NOT NULL THEN
    UPDATE public.assessments
    SET status = 'paid'
    WHERE unit_id = v_unit_id
      AND assessment_type = 'late_fee'
      AND amount = 55.00
      AND due_date = '2026-03-01'
      AND status = 'open'
      AND deleted_at IS NULL;
  ELSE
    RAISE WARNING 'Unit not found: 904 Urban Ash Court (Aswani)';
  END IF;

  -- ─── Assert the result matches the report, or roll everything back ──
  -- This script is a DELTA against seed-madison-park-dues-aging.sql
  -- (the 5/27/2026 report). Applied on its own to a database that never
  -- received that seed, every insert above still succeeds -- they are
  -- unconditional NOT EXISTS guards -- and the association total lands
  -- somewhere plausible but wrong. A wrong AR total is not the kind of
  -- thing to discover from a resident's dues reminder, so assert it.
  --
  -- This check lives INSIDE the same DO block as the writes above, on
  -- purpose. A DO block is a single statement, so it is a single
  -- transaction: raising here rolls back this script's own inserts and
  -- the Aswani update along with it, leaving the database exactly as it
  -- was. As a separate statement it would not -- the inserts would have
  -- committed already and the exception would strand a half-applied
  -- reconciliation.
  --
  -- $9,475.88 is the "AR Total" printed on the 07/21/2026 report.
  SELECT COALESCE(SUM(a.amount), 0) INTO v_total
  FROM public.assessments a
  WHERE a.organization_id = v_org_id
    AND a.status = 'open'
    AND a.deleted_at IS NULL;

  IF v_total <> 9475.88 THEN
    RAISE EXCEPTION
      'Madison Park AR is %, expected $9,475.88 per the 07/21/2026 aging report. Nothing was changed. Run seed-madison-park-dues-aging.sql first (it is idempotent), then re-run this file.',
      to_char(v_total, 'FM$9,999,990.00');
  END IF;

  RAISE NOTICE 'Done. Madison Park AR reconciled to the 07/21/2026 aging report: $9,475.88.';
END $$;

-- ─── Verify: per-owner balances should match the report ─────────────
-- Expected: 3580 Allee Elm $2,265.00 | 3597 Old Maple $5,678.58
--           3600 Allee Elm $47.80    | 914 Urban Ash  $49.50
--           10079 Trumpet  $1,435.00 | TOTAL          $9,475.88
SELECT
  hp.address,
  SUM(a.amount) AS balance
FROM public.assessments a
JOIN public.units u ON u.id = a.unit_id
JOIN public.hoa_properties hp ON hp.id = u.legacy_hoa_property_id
WHERE a.organization_id = 'a4906f16-baf3-4232-a2bd-a78ea432ad86'
  AND a.status = 'open'
  AND a.deleted_at IS NULL
GROUP BY ROLLUP (hp.address)
ORDER BY hp.address NULLS LAST;
