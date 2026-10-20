-- ============================================================================
-- Payment plans created before 2026-10-19 count the balance twice
-- ============================================================================
--
-- THE BUG. Until 2026-10-19, createPaymentPlan (apps/hoa/src/lib/payment-plans.ts)
-- billed one 'special' charge per installment, each with a Dr AR (1100) /
-- Cr Assessment Income (4000) entry, and never closed the charges the plan
-- was meant to spread. The owner's balance, AR and income therefore carry
-- the same money twice: once on the original charges, once on the
-- installments. Estoppel, collections letters, dues reminders, reports and
-- the month-end board report all read the inflated figure.
--
-- THE FIX (code, 2026-10-19). A new plan closes the charges it replaces in
-- the same operation, per replaced charge, on what is still open on it:
--     Dr 4000 Assessment Income (4100 Late Fee Income for a late fee)
--     Cr 1100 Accounts Receivable                       fund OPERATING
--   memo 'Payment plan replaces charge (plan <first 8 of plan id>)',
--   source 'ar_payment', source_id = the replaced assessment,
--   and the assessment's status is set to 'waived'.
-- The board's Payment plans page warns about every plan that has no such
-- entry. Correcting a plan with PART 3 below clears its warning.
--
-- THIS FILE. Nothing here runs by itself and nothing has been applied.
--   PART 1 and PART 2 are read-only. Output is ids, dates and cents only.
--   PART 3 is the correction. It runs inside a transaction that ends in
--   ROLLBACK. Asaf reviews PART 2, lists the charges each plan replaced,
--   runs PART 3 once to check the preview, then changes ROLLBACK to COMMIT.
--
-- The app can't tell which charges a pre-fix plan was meant to spread,
-- because the old form took a free-typed total. PART 2 lists the
-- candidates: charges on the plan's unit that were billed before the plan,
-- are still open, and are not installments of any plan. Where their open
-- total equals the plan total, the match is likely. Otherwise the board
-- has to decide which charges go in.
--
-- Correcting a plan leaves every installment as it is. The installments are
-- what the owner now owes. Only the replaced originals are closed.
-- ============================================================================


-- ─── PART 1 (read-only): affected plans ─────────────────────────────────────
-- Plans with no replaced-charge entry, with what their installments carry.
WITH linked AS (
  SELECT DISTINCT je.association_id,
         substring(je.memo FROM '\(plan ([0-9a-f]{8})\)$') AS plan_key
  FROM public.journal_entries je
  WHERE je.memo LIKE 'Payment plan replaces charge %'
    AND je.status = 'posted'
),
inst AS (
  SELECT je.association_id,
         substring(je.memo FROM '\(plan ([0-9a-f]{8})\)$') AS plan_key,
         je.source_id AS assessment_id
  FROM public.journal_entries je
  WHERE je.memo LIKE 'Payment plan installment %'
    AND je.source = 'ar_payment'
    AND je.status = 'posted'
)
SELECT p.id                                   AS plan_id,
       p.unit_id,
       u.association_id,
       p.status                               AS plan_status,
       p.created_at::date                     AS created_on,
       round(p.total_amount * 100)::bigint    AS plan_total_cents,
       p.installment_count,
       count(a.id)                            AS installments_found,
       coalesce(sum(round(a.amount * 100)) FILTER (WHERE a.deleted_at IS NULL), 0)::bigint AS installments_cents
FROM public.payment_plans p
JOIN public.units u ON u.id = p.unit_id
LEFT JOIN linked l ON l.association_id = u.association_id AND l.plan_key = left(p.id::text, 8)
LEFT JOIN inst i   ON i.association_id = u.association_id AND i.plan_key = left(p.id::text, 8)
LEFT JOIN public.assessments a ON a.id = i.assessment_id AND a.unit_id = p.unit_id
WHERE l.plan_key IS NULL
GROUP BY p.id, p.unit_id, u.association_id, p.status, p.created_at, p.total_amount, p.installment_count
ORDER BY u.association_id, p.created_at;


-- ─── PART 2 (read-only): candidate original charges per affected plan ──────
-- Open, non-installment charges on the plan's unit created before the plan.
-- running_open_cents accumulates oldest first. matches_plan_total marks
-- the row where the candidates add up exactly to the plan total.
WITH linked AS (
  SELECT DISTINCT je.association_id,
         substring(je.memo FROM '\(plan ([0-9a-f]{8})\)$') AS plan_key
  FROM public.journal_entries je
  WHERE je.memo LIKE 'Payment plan replaces charge %' AND je.status = 'posted'
),
installment_ids AS (
  SELECT je.source_id AS assessment_id
  FROM public.journal_entries je
  WHERE je.memo LIKE 'Payment plan installment %' AND je.source = 'ar_payment' AND je.status = 'posted'
),
affected AS (
  SELECT p.id AS plan_id, p.unit_id, p.created_at, round(p.total_amount * 100)::bigint AS plan_total_cents
  FROM public.payment_plans p
  JOIN public.units u ON u.id = p.unit_id
  LEFT JOIN linked l ON l.association_id = u.association_id AND l.plan_key = left(p.id::text, 8)
  WHERE l.plan_key IS NULL
),
candidates AS (
  SELECT f.plan_id,
         f.plan_total_cents,
         a.id AS assessment_id,
         a.assessment_type,
         a.due_date,
         a.status,
         (round(a.amount * 100) - coalesce((SELECT round(sum(pm.amount) * 100) FROM public.payments pm WHERE pm.assessment_id = a.id), 0))::bigint AS open_cents
  FROM affected f
  JOIN public.assessments a ON a.unit_id = f.unit_id
  WHERE a.deleted_at IS NULL
    AND a.status IN ('open', 'partial')
    AND a.created_at < f.created_at
    AND a.id NOT IN (SELECT assessment_id FROM installment_ids WHERE assessment_id IS NOT NULL)
)
SELECT plan_id,
       plan_total_cents,
       assessment_id,
       assessment_type,
       due_date,
       status,
       open_cents,
       sum(open_cents) OVER (PARTITION BY plan_id ORDER BY due_date, assessment_id) AS running_open_cents,
       sum(open_cents) OVER (PARTITION BY plan_id ORDER BY due_date, assessment_id) = plan_total_cents AS matches_plan_total
FROM candidates
WHERE open_cents > 0
ORDER BY plan_id, due_date, assessment_id;


-- ─── PART 3 (correction, review first): close the charges each plan replaced ─
-- 1. Fill pp_fix with (plan_id, assessment_id) pairs taken from PART 2.
-- 2. Run the whole block. It ends in ROLLBACK and shows the entries it
--    would post and the AR / income change per association. The AR and
--    income change should both equal minus the double-counted amount.
-- 3. When the preview is right, change ROLLBACK to COMMIT and run it once.
-- The guards refuse charges that are not open, are not on the plan's unit,
-- are installments, or were already closed for a plan. The validate_je_balances
-- trigger checks every entry balances overall and per fund when it posts.
BEGIN;

CREATE TEMP TABLE pp_fix (
  plan_id       uuid NOT NULL,
  assessment_id uuid NOT NULL PRIMARY KEY
) ON COMMIT DROP;

-- INSERT INTO pp_fix (plan_id, assessment_id) VALUES
--   ('<plan uuid>', '<assessment uuid>'),
--   ('<plan uuid>', '<assessment uuid>');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pp_fix) THEN
    RAISE EXCEPTION 'pp_fix is empty: list the (plan_id, assessment_id) pairs from PART 2 first';
  END IF;
END $$;

CREATE TEMP TABLE pp_rows ON COMMIT DROP AS
SELECT f.plan_id,
       a.id AS assessment_id,
       a.organization_id,
       a.association_id,
       a.assessment_type,
       a.status,
       round(a.amount - coalesce((SELECT sum(pm.amount) FROM public.payments pm WHERE pm.assessment_id = a.id), 0), 2) AS open_amount
FROM pp_fix f
JOIN public.payment_plans p ON p.id = f.plan_id
JOIN public.assessments a   ON a.id = f.assessment_id AND a.unit_id = p.unit_id
WHERE a.deleted_at IS NULL;

DO $$
DECLARE
  n_fix  int := (SELECT count(*) FROM pp_fix);
  n_rows int := (SELECT count(*) FROM pp_rows);
BEGIN
  IF n_rows <> n_fix THEN
    RAISE EXCEPTION 'pp_fix has % rows but only % are live charges on their plan''s unit', n_fix, n_rows;
  END IF;
  IF EXISTS (SELECT 1 FROM pp_rows WHERE status NOT IN ('open', 'partial') OR open_amount <= 0) THEN
    RAISE EXCEPTION 'a listed charge is not open (status or open amount)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pp_rows r JOIN public.journal_entries je
      ON je.source_id = r.assessment_id AND je.status = 'posted'
     AND (je.memo LIKE 'Payment plan installment %' OR je.memo LIKE 'Payment plan replaces charge %')
  ) THEN
    RAISE EXCEPTION 'a listed charge is a plan installment or was already closed for a plan';
  END IF;
END $$;

CREATE TEMP TABLE pp_je ON COMMIT DROP AS
SELECT r.*,
       gen_random_uuid() AS je_id,
       fp.id             AS fiscal_period_id,
       'JE-' || to_char(current_date, 'YYYY') || '-' ||
         lpad((coalesce(mx.last_seq, 0)
               + row_number() OVER (PARTITION BY r.association_id ORDER BY r.plan_id, r.assessment_id))::text, 5, '0') AS entry_number,
       ar.id  AS acct_ar,
       inc.id AS acct_income,
       fo.id  AS fund_operating
FROM pp_rows r
JOIN LATERAL (
  SELECT id FROM public.fiscal_periods
  WHERE association_id = r.association_id AND status = 'open' AND start_date <= current_date
  ORDER BY start_date DESC LIMIT 1
) fp ON true
LEFT JOIN LATERAL (
  SELECT max(substring(entry_number FROM '^JE-\d{4}-(\d+)$')::int) AS last_seq
  FROM public.journal_entries
  WHERE association_id = r.association_id
    AND entry_number LIKE 'JE-' || to_char(current_date, 'YYYY') || '-%'
) mx ON true
JOIN public.chart_of_accounts ar  ON ar.association_id = r.association_id AND ar.account_number = '1100'
JOIN public.chart_of_accounts inc ON inc.association_id = r.association_id
                                 AND inc.account_number = CASE WHEN r.assessment_type = 'late_fee' THEN '4100' ELSE '4000' END
JOIN public.funds fo ON fo.association_id = r.association_id AND fo.code = 'OPERATING';

DO $$
BEGIN
  IF (SELECT count(*) FROM pp_je) <> (SELECT count(*) FROM pp_rows) THEN
    RAISE EXCEPTION 'an association has no open fiscal period, or is missing account 1100/4000/4100 or the OPERATING fund';
  END IF;
END $$;

INSERT INTO public.journal_entries
  (id, organization_id, association_id, fiscal_period_id, entry_number, entry_date, memo, source, source_id, status)
SELECT je_id, organization_id, association_id, fiscal_period_id, entry_number, current_date,
       'Payment plan replaces charge (plan ' || left(plan_id::text, 8) || ')',
       'ar_payment', assessment_id, 'draft'
FROM pp_je;

INSERT INTO public.ledger_entries (organization_id, journal_entry_id, account_id, fund_id, debit_amount, credit_amount)
SELECT organization_id, je_id, acct_income, fund_operating, open_amount, 0 FROM pp_je
UNION ALL
SELECT organization_id, je_id, acct_ar,     fund_operating, 0, open_amount FROM pp_je;

-- Fires validate_je_balances (overall and per fund).
UPDATE public.journal_entries SET status = 'posted', posted_at = now()
WHERE id IN (SELECT je_id FROM pp_je);

UPDATE public.assessments SET status = 'waived'
WHERE id IN (SELECT assessment_id FROM pp_je) AND status IN ('open', 'partial');

-- Preview: the entries, then the change per association (cents).
SELECT plan_id, assessment_id, entry_number, round(open_amount * 100)::bigint AS closed_cents
FROM pp_je ORDER BY plan_id, entry_number;

SELECT association_id,
       count(*)                                  AS charges_closed,
       -round(sum(open_amount) * 100)::bigint    AS ar_change_cents,
       -round(sum(open_amount) * 100)::bigint    AS income_change_cents
FROM pp_je GROUP BY association_id;

ROLLBACK;  -- change to COMMIT after review
