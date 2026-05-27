-- seed-madison-park-dues-aging.sql
-- Inserts aging report data from CINCSystems export (5/27/2026).
-- 6 homeowners with outstanding balances across regular dues,
-- late fees, fines, and special assessments.
--
-- Idempotent: uses NOT EXISTS guard on (unit_id, assessment_type, due_date, amount).
-- Run from: https://supabase.com/dashboard/project/xwdjsxfskvreguyvryhc/sql/new

DO $$
DECLARE
  v_org_id         uuid := 'a4906f16-baf3-4232-a2bd-a78ea432ad86';
  v_assoc_id       uuid;
  v_fp_id          uuid;
  v_unit_id        uuid;
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

  -- ─── 1. Vishnupriya Kailasam — 3600 Allee Elm Drive, Lot 31 ──────
  SELECT u.id INTO v_unit_id
  FROM public.units u
  JOIN public.hoa_properties hp ON hp.id = u.legacy_hoa_property_id
  WHERE u.organization_id = v_org_id AND hp.address ILIKE '%3600 Allee Elm%'
  LIMIT 1;

  IF v_unit_id IS NOT NULL THEN
    -- Late fee 2025: $47.50
    INSERT INTO public.assessments (organization_id, association_id, unit_id, fiscal_period_id, assessment_type, amount, due_date, status)
    SELECT v_org_id, v_assoc_id, v_unit_id, v_fp_id, 'late_fee', 47.50, '2025-07-01', 'open'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.assessments WHERE unit_id = v_unit_id AND assessment_type = 'late_fee' AND amount = 47.50 AND due_date = '2025-07-01' AND deleted_at IS NULL
    );
    -- Regular 2026: $0.30
    INSERT INTO public.assessments (organization_id, association_id, unit_id, fiscal_period_id, assessment_type, amount, due_date, status)
    SELECT v_org_id, v_assoc_id, v_unit_id, v_fp_id, 'regular', 0.30, '2026-01-01', 'open'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.assessments WHERE unit_id = v_unit_id AND assessment_type = 'regular' AND amount = 0.30 AND due_date = '2026-01-01' AND deleted_at IS NULL
    );
  END IF;

  -- ─── 2. Holly Stiehm Young — 914 Urban Ash Court, Lot 38 ─────────
  SELECT u.id INTO v_unit_id
  FROM public.units u
  JOIN public.hoa_properties hp ON hp.id = u.legacy_hoa_property_id
  WHERE u.organization_id = v_org_id AND hp.address ILIKE '%914 Urban Ash%'
  LIMIT 1;

  IF v_unit_id IS NOT NULL THEN
    -- Gate Opener 2024: $49.50
    INSERT INTO public.assessments (organization_id, association_id, unit_id, fiscal_period_id, assessment_type, amount, due_date, status)
    SELECT v_org_id, v_assoc_id, v_unit_id, v_fp_id, 'special', 49.50, '2024-01-01', 'open'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.assessments WHERE unit_id = v_unit_id AND assessment_type = 'special' AND amount = 49.50 AND due_date = '2024-01-01' AND deleted_at IS NULL
    );
  END IF;

  -- ─── 3. Javed M. Aswani — 904 Urban Ash Court, Lot 37 ────────────
  SELECT u.id INTO v_unit_id
  FROM public.units u
  JOIN public.hoa_properties hp ON hp.id = u.legacy_hoa_property_id
  WHERE u.organization_id = v_org_id AND hp.address ILIKE '%904 Urban Ash%'
  LIMIT 1;

  IF v_unit_id IS NOT NULL THEN
    -- Late fee 2026: $55.00
    INSERT INTO public.assessments (organization_id, association_id, unit_id, fiscal_period_id, assessment_type, amount, due_date, status)
    SELECT v_org_id, v_assoc_id, v_unit_id, v_fp_id, 'late_fee', 55.00, '2026-03-01', 'open'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.assessments WHERE unit_id = v_unit_id AND assessment_type = 'late_fee' AND amount = 55.00 AND due_date = '2026-03-01' AND deleted_at IS NULL
    );
  END IF;

  -- ─── 4. Haritha Tanneru — 10079 Trumpet Park, Lot 36 ─────────────
  SELECT u.id INTO v_unit_id
  FROM public.units u
  JOIN public.hoa_properties hp ON hp.id = u.legacy_hoa_property_id
  WHERE u.organization_id = v_org_id AND hp.address ILIKE '%10079 Trumpet%'
  LIMIT 1;

  IF v_unit_id IS NOT NULL THEN
    -- Late fee 2026: $185.00
    INSERT INTO public.assessments (organization_id, association_id, unit_id, fiscal_period_id, assessment_type, amount, due_date, status)
    SELECT v_org_id, v_assoc_id, v_unit_id, v_fp_id, 'late_fee', 185.00, '2026-03-01', 'open'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.assessments WHERE unit_id = v_unit_id AND assessment_type = 'late_fee' AND amount = 185.00 AND due_date = '2026-03-01' AND deleted_at IS NULL
    );
    -- Violation Fine 2025: $1,250.00
    INSERT INTO public.assessments (organization_id, association_id, unit_id, fiscal_period_id, assessment_type, amount, due_date, status)
    SELECT v_org_id, v_assoc_id, v_unit_id, v_fp_id, 'fine', 1250.00, '2025-06-01', 'open'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.assessments WHERE unit_id = v_unit_id AND assessment_type = 'fine' AND amount = 1250.00 AND due_date = '2025-06-01' AND deleted_at IS NULL
    );
  END IF;

  -- ─── 5. Manpreet Kaur — 3580 Allee Elm Drive, Lot 26 ─────────────
  SELECT u.id INTO v_unit_id
  FROM public.units u
  JOIN public.hoa_properties hp ON hp.id = u.legacy_hoa_property_id
  WHERE u.organization_id = v_org_id AND hp.address ILIKE '%3580 Allee Elm%'
  LIMIT 1;

  IF v_unit_id IS NOT NULL THEN
    -- Late fee 2026: $185.00
    INSERT INTO public.assessments (organization_id, association_id, unit_id, fiscal_period_id, assessment_type, amount, due_date, status)
    SELECT v_org_id, v_assoc_id, v_unit_id, v_fp_id, 'late_fee', 185.00, '2026-03-01', 'open'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.assessments WHERE unit_id = v_unit_id AND assessment_type = 'late_fee' AND amount = 185.00 AND due_date = '2026-03-01' AND deleted_at IS NULL
    );
    -- Regular 2026: $1,850.00
    INSERT INTO public.assessments (organization_id, association_id, unit_id, fiscal_period_id, assessment_type, amount, due_date, status)
    SELECT v_org_id, v_assoc_id, v_unit_id, v_fp_id, 'regular', 1850.00, '2026-01-01', 'open'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.assessments WHERE unit_id = v_unit_id AND assessment_type = 'regular' AND amount = 1850.00 AND due_date = '2026-01-01' AND deleted_at IS NULL
    );
    -- Collection Letter Fee 2026: $55.00
    INSERT INTO public.assessments (organization_id, association_id, unit_id, fiscal_period_id, assessment_type, amount, due_date, status)
    SELECT v_org_id, v_assoc_id, v_unit_id, v_fp_id, 'special', 55.00, '2026-04-01', 'open'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.assessments WHERE unit_id = v_unit_id AND assessment_type = 'special' AND amount = 55.00 AND due_date = '2026-04-01' AND deleted_at IS NULL
    );
  END IF;

  -- ─── 6. Larry & Jacqueline Wilson — 3597 Old Maple Drive, Lot 45 ──
  SELECT u.id INTO v_unit_id
  FROM public.units u
  JOIN public.hoa_properties hp ON hp.id = u.legacy_hoa_property_id
  WHERE u.organization_id = v_org_id AND hp.address ILIKE '%3597 Old Maple%'
  LIMIT 1;

  IF v_unit_id IS NOT NULL THEN
    -- Legal Fee - Collection 2025: $185.11
    INSERT INTO public.assessments (organization_id, association_id, unit_id, fiscal_period_id, assessment_type, amount, due_date, status)
    SELECT v_org_id, v_assoc_id, v_unit_id, v_fp_id, 'special', 185.11, '2025-04-01', 'open'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.assessments WHERE unit_id = v_unit_id AND assessment_type = 'special' AND amount = 185.11 AND due_date = '2025-04-01' AND deleted_at IS NULL
    );
    -- Lien Filing Fee 2024: $155.00
    INSERT INTO public.assessments (organization_id, association_id, unit_id, fiscal_period_id, assessment_type, amount, due_date, status)
    SELECT v_org_id, v_assoc_id, v_unit_id, v_fp_id, 'special', 155.00, '2024-10-01', 'open'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.assessments WHERE unit_id = v_unit_id AND assessment_type = 'special' AND amount = 155.00 AND due_date = '2024-10-01' AND deleted_at IS NULL
    );
    -- Late fees 2021-2026
    INSERT INTO public.assessments (organization_id, association_id, unit_id, fiscal_period_id, assessment_type, amount, due_date, status)
    SELECT v_org_id, v_assoc_id, v_unit_id, v_fp_id, 'late_fee', amt, dd, 'open'
    FROM (VALUES
      (13.70,  '2021-07-01'::date),
      (15.70,  '2022-07-01'::date),
      (15.70,  '2023-07-01'::date),
      (160.00, '2024-07-01'::date),
      (175.00, '2025-07-01'::date),
      (185.00, '2026-03-01'::date)
    ) AS v(amt, dd)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.assessments WHERE unit_id = v_unit_id AND assessment_type = 'late_fee' AND amount = v.amt AND due_date = v.dd AND deleted_at IS NULL
    );
    -- Regular dues 2024-2026
    INSERT INTO public.assessments (organization_id, association_id, unit_id, fiscal_period_id, assessment_type, amount, due_date, status)
    SELECT v_org_id, v_assoc_id, v_unit_id, v_fp_id, 'regular', amt, dd, 'open'
    FROM (VALUES
      (709.90,  '2024-01-01'::date),
      (1750.00, '2025-01-01'::date),
      (1850.00, '2026-01-01'::date)
    ) AS v(amt, dd)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.assessments WHERE unit_id = v_unit_id AND assessment_type = 'regular' AND amount = v.amt AND due_date = v.dd AND deleted_at IS NULL
    );
    -- Collection Letter Fee 2020: $40.00
    INSERT INTO public.assessments (organization_id, association_id, unit_id, fiscal_period_id, assessment_type, amount, due_date, status)
    SELECT v_org_id, v_assoc_id, v_unit_id, v_fp_id, 'special', 40.00, '2020-03-01', 'open'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.assessments WHERE unit_id = v_unit_id AND assessment_type = 'special' AND amount = 40.00 AND due_date = '2020-03-01' AND deleted_at IS NULL
    );
    -- Collection Letter Fee 2024: $45.00
    INSERT INTO public.assessments (organization_id, association_id, unit_id, fiscal_period_id, assessment_type, amount, due_date, status)
    SELECT v_org_id, v_assoc_id, v_unit_id, v_fp_id, 'special', 45.00, '2024-07-01', 'open'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.assessments WHERE unit_id = v_unit_id AND assessment_type = 'special' AND amount = 45.00 AND due_date = '2024-07-01' AND deleted_at IS NULL
    );
    -- Collection Processing Fee 2025: $185.00
    INSERT INTO public.assessments (organization_id, association_id, unit_id, fiscal_period_id, assessment_type, amount, due_date, status)
    SELECT v_org_id, v_assoc_id, v_unit_id, v_fp_id, 'special', 185.00, '2025-04-01', 'open'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.assessments WHERE unit_id = v_unit_id AND assessment_type = 'special' AND amount = 185.00 AND due_date = '2025-04-01' AND deleted_at IS NULL
    );
  END IF;

  RAISE NOTICE 'Done. Inserted aging report assessments for Madison Park.';
END $$;

-- Verify totals
SELECT
  hp.address,
  a.assessment_type,
  a.amount,
  a.due_date,
  a.status
FROM public.assessments a
JOIN public.units u ON u.id = a.unit_id
JOIN public.hoa_properties hp ON hp.id = u.legacy_hoa_property_id
WHERE a.organization_id = 'a4906f16-baf3-4232-a2bd-a78ea432ad86'
  AND a.status = 'open'
  AND a.deleted_at IS NULL
ORDER BY hp.address, a.due_date;
