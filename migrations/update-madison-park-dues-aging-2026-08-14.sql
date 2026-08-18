-- update-madison-park-dues-aging-2026-08-14.sql
-- Reconciles Madison Park AR against the CINCSystems aging report
-- "Homeowner Aging Report", End Date 08/14/2026.
--
-- Delta vs. the prior 7/21/2026 report applied by
-- migrations/update-madison-park-dues-aging-2026-07-21.sql:
--
--   + Akbar & Radha Rizvi   Gate Opener 2026        $35.00  (new, Current)
--   - Vishnupriya Kailasam  Delinquent Fee 2025     $47.50  (cleared -> paid)
--   - Vishnupriya Kailasam  Regular 2026             $0.30  (cleared -> paid)
--   - Holly Stiehm Young    Gate Opener 2024        $49.50  (cleared -> paid)
--
-- Unchanged in dollars: Haritha Tanneru ($1,435.00), Manpreet Kaur
-- ($2,265.00), Larry & Jacqueline Wilson ($5,678.58).
--
-- Association AR total after this run: $9,413.58
--   Rizvi       $35.00
--   Tanneru  $1,435.00
--   Kaur     $2,265.00
--   Wilson   $5,678.58
--
-- ─── Nothing to do for the two collections files ─────────────────────
--
-- Kaur and Wilson each moved a charge from Over 30 into Over 60 -- Kaur's
-- $175.00 lien filing fee and Wilson's $193.47 legal fee. That is the
-- calendar advancing over charges that were already recorded, not new
-- activity: buckets are derived from due_date, so nothing is written for
-- it. Both owners' note histories on the 08/14 report are also unchanged
-- from 07/21, ending at Kaur's open "Final Notice?" question to the board
-- and Wilson's 6/1/26 demand letter. seed-madison-park-collections-2026-07-21.sql
-- therefore still describes both cases correctly and needs no update.
--
-- Idempotent: NOT EXISTS guard on the insert, status='open' guard on the
-- updates. Safe to re-run.
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

  -- ─── 1. Akbar Rizvi & Radha Rizvi — 829 Pistace Ct, Lot 12 ───────
  -- First appearance on the aging report; this unit had no assessments
  -- at all before now. Gate Opener 2026, $35.00, sitting in Current.
  --
  -- The report prints the bucket but not the charge date. Current means
  -- fewer than 30 days past due as of the 08/14 end date, so the due date
  -- is on or after ~07/15/2026; 08/01/2026 is used, which also sits just
  -- after the owner's 08/07/2026 $700.00 payment cleared the rest of the
  -- account. If CINC can produce the exact post date, correct it here --
  -- the value only has to keep the charge inside Current.
  SELECT u.id INTO v_unit_id
  FROM public.units u
  JOIN public.hoa_properties hp ON hp.id = u.legacy_hoa_property_id
  WHERE u.organization_id = v_org_id AND hp.address ILIKE '%829 Pistace%'
  LIMIT 1;

  IF v_unit_id IS NOT NULL THEN
    -- Gate Opener 2026: $35.00
    --
    -- 'special', not one of 0047's collection categories. A gate opener is
    -- an amenity charge, not a cost of collecting a debt, so it must not
    -- land in the § 44-3-234 attorneys'-fees/late-fee breakout. This also
    -- matches the only other gate opener in the data -- Young's "Gate
    -- Opener 2024", which 0047 deliberately left as 'special'.
    INSERT INTO public.assessments (organization_id, association_id, unit_id, fiscal_period_id, assessment_type, amount, due_date, status)
    SELECT v_org_id, v_assoc_id, v_unit_id, v_fp_id, 'special', 35.00, '2026-08-01', 'open'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.assessments WHERE unit_id = v_unit_id AND assessment_type = 'special' AND amount = 35.00 AND due_date = '2026-08-01' AND deleted_at IS NULL
    );
  ELSE
    RAISE WARNING 'Unit not found: 829 Pistace Ct (Rizvi)';
  END IF;

  -- ─── 2. Vishnupriya Kailasam — 3600 Allee Elm Drive, Lot 31 ──────
  -- Dropped off the 8/14 report entirely, so both charges seeded from the
  -- 5/27 report are settled. Confirmed at the charge-code level too: the
  -- report's "Delinquent Fee 2025" line fell from $222.50 to $175.00
  -- (Wilson's share alone) and "Regular 2026" from $3,700.30 to
  -- $3,700.00, which is exactly these two amounts leaving.
  SELECT u.id INTO v_unit_id
  FROM public.units u
  JOIN public.hoa_properties hp ON hp.id = u.legacy_hoa_property_id
  WHERE u.organization_id = v_org_id AND hp.address ILIKE '%3600 Allee Elm%'
  LIMIT 1;

  IF v_unit_id IS NOT NULL THEN
    -- Delinquent Fee 2025: $47.50
    UPDATE public.assessments
    SET status = 'paid'
    WHERE unit_id = v_unit_id
      AND assessment_type = 'late_fee'
      AND amount = 47.50
      AND due_date = '2025-07-01'
      AND status = 'open'
      AND deleted_at IS NULL;

    -- Member Assessments - Regular 2026: $0.30
    UPDATE public.assessments
    SET status = 'paid'
    WHERE unit_id = v_unit_id
      AND assessment_type = 'regular'
      AND amount = 0.30
      AND due_date = '2026-01-01'
      AND status = 'open'
      AND deleted_at IS NULL;
  ELSE
    RAISE WARNING 'Unit not found: 3600 Allee Elm Drive (Kailasam)';
  END IF;

  -- ─── 3. Holly Stiehm Young — 914 Urban Ash Court, Lot 38 ─────────
  -- Also dropped off the 8/14 report. The "Gate Opener 2024" charge code
  -- is gone from the report's code breakdown entirely, replaced by the
  -- Rizvi "Gate Opener 2026" line -- so this is settled, not re-aged.
  SELECT u.id INTO v_unit_id
  FROM public.units u
  JOIN public.hoa_properties hp ON hp.id = u.legacy_hoa_property_id
  WHERE u.organization_id = v_org_id AND hp.address ILIKE '%914 Urban Ash%'
  LIMIT 1;

  IF v_unit_id IS NOT NULL THEN
    -- Gate Opener 2024: $49.50
    UPDATE public.assessments
    SET status = 'paid'
    WHERE unit_id = v_unit_id
      AND assessment_type = 'special'
      AND amount = 49.50
      AND due_date = '2024-01-01'
      AND status = 'open'
      AND deleted_at IS NULL;
  ELSE
    RAISE WARNING 'Unit not found: 914 Urban Ash Court (Young)';
  END IF;

  -- ─── Assert the result matches the report, or roll everything back ──
  -- Same reasoning as the 07/21 file: this is a DELTA, and every write
  -- above succeeds unconditionally against a database that never received
  -- the earlier files, landing on a plausible but wrong total. Applied to
  -- a database still at the 5/27 baseline, for instance, Aswani's $55.00
  -- is still open and the total comes out $9,468.58 -- close enough to
  -- look right in a dues reminder and be wrong.
  --
  -- The check lives INSIDE this DO block on purpose. A DO block is one
  -- statement and therefore one transaction, so raising here rolls back
  -- this script's own insert and both updates and leaves the database
  -- exactly as it was. As a separate statement it would not.
  --
  -- $9,413.58 is the "AR Total (Exclude Prepaid Assessments)" printed on
  -- the 08/14/2026 report.
  SELECT COALESCE(SUM(a.amount), 0) INTO v_total
  FROM public.assessments a
  WHERE a.organization_id = v_org_id
    AND a.status = 'open'
    AND a.deleted_at IS NULL;

  IF v_total <> 9413.58 THEN
    RAISE EXCEPTION
      'Madison Park AR is %, expected $9,413.58 per the 08/14/2026 aging report. Nothing was changed. Apply seed-madison-park-dues-aging.sql then update-madison-park-dues-aging-2026-07-21.sql first (both are idempotent), then re-run this file.',
      to_char(v_total, 'FM$9,999,990.00');
  END IF;

  RAISE NOTICE 'Done. Madison Park AR reconciled to the 08/14/2026 aging report: $9,413.58.';
END $$;

-- ─── Verify 1: per-owner balances should match the report ───────────
-- Expected: 829 Pistace    $35.00    | 10079 Trumpet  $1,435.00
--           3580 Allee Elm $2,265.00 | 3597 Old Maple $5,678.58
--           TOTAL          $9,413.58
-- 3600 Allee Elm and 914 Urban Ash should not appear at all.
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

-- ─── Verify 2: the aging buckets themselves ─────────────────────────
-- The per-owner total matching is necessary but not sufficient -- it says
-- nothing about whether the due dates are right. This re-derives the
-- report's four buckets from due_date as of the report end date, which is
-- the check that would catch a charge filed under the wrong date.
--
-- Expected, matching the report's association footer exactly:
--   Current $35.00 | Over 30 $0.00 | Over 60 $368.47 | Over 90 $9,010.11
SELECT
  COALESCE(SUM(a.amount) FILTER (WHERE DATE '2026-08-14' - a.due_date <  30), 0)                                      AS bucket_current,
  COALESCE(SUM(a.amount) FILTER (WHERE DATE '2026-08-14' - a.due_date >= 30 AND DATE '2026-08-14' - a.due_date < 60), 0) AS bucket_over_30,
  COALESCE(SUM(a.amount) FILTER (WHERE DATE '2026-08-14' - a.due_date >= 60 AND DATE '2026-08-14' - a.due_date < 90), 0) AS bucket_over_60,
  COALESCE(SUM(a.amount) FILTER (WHERE DATE '2026-08-14' - a.due_date >= 90), 0)                                      AS bucket_over_90,
  COALESCE(SUM(a.amount), 0)                                                                                          AS balance
FROM public.assessments a
WHERE a.organization_id = 'a4906f16-baf3-4232-a2bd-a78ea432ad86'
  AND a.status = 'open'
  AND a.deleted_at IS NULL;
