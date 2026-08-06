-- 0039_property_list_view.sql
-- One row per hoa_property carrying the four attention signals the
-- properties list needs, so the page answers "what needs me today" in a
-- single indexed query instead of N+1 per row at 5,000+ properties.
--
-- SECURITY — read this before changing anything below.
--
-- Two gates, both required:
--
--   1. security_invoker = on. Without it the view runs with its owner's
--      rights and ignores RLS on every base table — cross-org leakage.
--
--   2. auth_is_board_or_admin(org_id) in the WHERE clause. security_invoker
--      alone is NOT sufficient here: org_access on hoa_properties and
--      hoa_violations (0000_schema.sql:398-399) is bare
--      org_id = ANY (auth_org_ids()) with no role gate, so every resident
--      of an association can already read those rows. A view that joins
--      balance, open violations, and unread mail per property would hand a
--      resident their neighbours' financial and enforcement history in one
--      query — strictly worse than the raw tables, because it does the
--      correlation for them. Same hazard 0036_ai_runs_board_only.sql closed
--      on ai_runs and 0038_dashboard_daily_snapshots.sql designs against.
--
-- This is the first SQL view in this repository — there is no house style
-- to copy, so the reasoning is spelled out rather than assumed.
--
-- Idempotent. Safe to re-run.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Search is four ILIKE '%term%' predicates OR'd together, which no btree
-- index can serve. Per-column trgm GIN indexes do serve them.
CREATE INDEX IF NOT EXISTS hoa_properties_address_trgm_idx
  ON public.hoa_properties USING gin (address gin_trgm_ops);
CREATE INDEX IF NOT EXISTS hoa_properties_unit_number_trgm_idx
  ON public.hoa_properties USING gin (unit_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS hoa_properties_owner_name_trgm_idx
  ON public.hoa_properties USING gin (owner_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS hoa_properties_owner_email_trgm_idx
  ON public.hoa_properties USING gin (owner_email gin_trgm_ops);

-- Lateral aggregate lookup keys. assessments already has a better partial
-- index for our filter — assessments_unit_open_idx on (unit_id, due_date)
-- WHERE status IN ('open','partial'), from 0006_accounting.sql — so it is
-- deliberately NOT duplicated here.
CREATE INDEX IF NOT EXISTS hoa_violations_property_id_idx
  ON public.hoa_violations(property_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS payments_assessment_id_idx
  ON public.payments(assessment_id);
CREATE INDEX IF NOT EXISTS inbox_threads_unit_id_idx
  ON public.inbox_threads(unit_id);
CREATE INDEX IF NOT EXISTS units_legacy_hoa_property_id_idx
  ON public.units(legacy_hoa_property_id);

CREATE OR REPLACE VIEW public.hoa_property_list_v
WITH (security_invoker = on) AS
SELECT
  p.id,
  p.org_id,
  p.address,
  p.unit_number,
  p.owner_name,
  p.owner_email,
  p.owner_phone,
  p.tenure,
  p.notes,
  p.created_at,
  p.updated_at,

  u.id AS unit_id,

  -- Money is numeric(14,2) everywhere in this schema. Not cents.
  COALESCE(dues.balance, 0)::numeric(14,2)        AS balance,
  dues.oldest_due_date,
  CASE
    WHEN dues.oldest_due_date IS NOT NULL AND dues.oldest_due_date < CURRENT_DATE
      THEN (CURRENT_DATE - dues.oldest_due_date)
    ELSE 0
  END                                             AS days_overdue,

  COALESCE(viol.open_violations, 0)               AS open_violations,
  COALESCE(viol.violations_past_cure, 0)          AS violations_past_cure,
  COALESCE(mail.threads_needing_reply, 0)         AS threads_needing_reply,

  (p.owner_name IS NOT NULL AND btrim(p.owner_name) <> '')   AS has_owner,
  (p.tenure IS NOT NULL AND p.tenure <> 'unknown')           AS has_tenure,
  (u.id IS NOT NULL)                                         AS has_unit_link,

  -- Lowest rank sorts first. A property matching several conditions takes
  -- its lowest. Past-cure outranks money: a lapsed cure deadline has legal
  -- consequences and cannot be recovered by acting sooner, whereas a
  -- balance keeps accruing predictably.
  CASE
    WHEN COALESCE(viol.violations_past_cure, 0) > 0 THEN 1
    WHEN COALESCE(dues.balance, 0) > 0
         AND dues.oldest_due_date IS NOT NULL
         AND dues.oldest_due_date < CURRENT_DATE   THEN 2
    WHEN COALESCE(viol.open_violations, 0) > 0     THEN 3
    WHEN COALESCE(mail.threads_needing_reply, 0) > 0 THEN 4
    WHEN p.owner_name IS NULL
         OR btrim(p.owner_name) = ''
         OR p.tenure IS NULL
         OR p.tenure = 'unknown'
         OR u.id IS NULL                           THEN 5
    ELSE 6
  END                                             AS severity_rank

FROM public.hoa_properties p

-- The bridge from 0005_units_backfill.sql. A NULL here IS the "no unit
-- link" data gap: assessments and inbox_threads key on units, not on
-- hoa_properties, so an unbridged property silently shows no dues and no
-- mail today with no visible symptom.
LEFT JOIN public.units u
  ON u.legacy_hoa_property_id = p.id

-- Outstanding dues. Only 'open' and 'partial' count — 'paid', 'waived' and
-- 'written_off' are settled and would inflate the balance. payments.amount
-- may be negative (refunds, per the CHECK amount <> 0), so this subtracts
-- signed sums rather than assuming positives. payments has no deleted_at.
LEFT JOIN LATERAL (
  SELECT
    SUM(a.amount - COALESCE(pay.paid, 0))                                  AS balance,
    MIN(a.due_date) FILTER (WHERE a.amount - COALESCE(pay.paid, 0) > 0)    AS oldest_due_date
  FROM public.assessments a
  LEFT JOIN LATERAL (
    SELECT SUM(pm.amount) AS paid
    FROM public.payments pm
    WHERE pm.assessment_id = a.id
  ) pay ON TRUE
  WHERE a.unit_id = u.id
    AND a.deleted_at IS NULL
    AND a.status IN ('open', 'partial')
) dues ON TRUE

-- Open violations. Five statuses exist (0000_schema.sql:212); open means
-- not yet settled. The cure clock starts when the notice went out — a NULL
-- notice_sent_at means no clock is running, so it is not past cure.
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)                                        AS open_violations,
    COUNT(*) FILTER (
      WHERE v.notice_sent_at IS NOT NULL
        AND v.notice_sent_at
            + make_interval(days => COALESCE(v.cure_period_days, 0)) < now()
    )                                               AS violations_past_cure
  FROM public.hoa_violations v
  WHERE v.property_id = p.id
    AND v.deleted_at IS NULL
    AND v.status NOT IN ('resolved', 'waived')
) viol ON TRUE

-- Mail awaiting US. 'waiting' means the ball is in the resident's court and
-- must not read as work owed by the association; 'closed' is done.
-- inbox_threads has no deleted_at.
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS threads_needing_reply
  FROM public.inbox_threads it
  WHERE it.unit_id = u.id
    AND it.organization_id = p.org_id
    AND it.status IN ('needs_review', 'open')
) mail ON TRUE

WHERE p.deleted_at IS NULL
  AND public.auth_is_board_or_admin(p.org_id);

COMMENT ON VIEW public.hoa_property_list_v IS
  'Attention signals per HOA property. Board/admin only — see the security note in 0039_property_list_view.sql before relaxing any predicate.';

GRANT SELECT ON public.hoa_property_list_v TO authenticated;
