-- 0045_property_list_view_review_fixes.sql
--
-- Closes three of the four findings in
-- docs/superpowers/reviews/2026-08-08-property-list-view-findings.md
-- against hoa_property_list_v (migrations 0039 / 0040).
--
-- Finding 1 (view returns 0 rows without a JWT) is NOT fixed here -- see
-- the COMMENT at the bottom for why it is documented rather than changed.
--
-- Idempotent. Safe to re-run.


-- ─── Finding 3: drop three indexes that duplicate existing ones ──────
--
-- 0039 added four indexes. Three already existed under a different name,
-- and Postgres does not deduplicate them: each costs extra pages plus
-- per-INSERT/UPDATE maintenance on payments and inbox_threads, two of the
-- highest-churn tables here, for no read benefit.
--
--   payments_assessment_id_idx        ON payments(assessment_id)
--     == payments_assessment_idx      (0006_accounting.sql:358) -- identical
--
--   units_legacy_hoa_property_id_idx  ON units(legacy_hoa_property_id)
--     vs units_legacy_hoa_idx         (0005_units_backfill.sql:31), which is
--     partial on WHERE legacy_hoa_property_id IS NOT NULL. The view joins
--     on equality, and equality never matches NULL, so the extra NULL rows
--     the 0039 index carries can never be read -- it is strictly worse.
--
--   inbox_threads_unit_id_idx         ON inbox_threads(unit_id)
--     vs inbox_threads_unit_idx       (0029_inbox.sql:106) on
--     (unit_id, last_message_at DESC) WHERE unit_id IS NOT NULL. The 0039
--     index is a leading-column prefix of it.
--
-- hoa_violations_property_id_idx is KEPT: it is partial on
-- WHERE deleted_at IS NULL, which the view filters on, so it is genuinely
-- narrower than idx_hoa_violations_property (0000_schema.sql:311).

DROP INDEX IF EXISTS public.payments_assessment_id_idx;
DROP INDEX IF EXISTS public.units_legacy_hoa_property_id_idx;
DROP INDEX IF EXISTS public.inbox_threads_unit_id_idx;


-- ─── Findings 2 and 4: rebuild the view ─────────────────────────────
--
-- Finding 2 -- one row per property, always.
--
-- 0040 kept `LEFT JOIN units u ON u.legacy_hoa_property_id = p.id`, and
-- nothing makes that one-to-one. units_legacy_hoa_idx is non-unique, and
-- 0028_property_bridge_backfill.sql:105-107 says so explicitly: multiple
-- units CAN share one hoa_property row (unit 101 and 102 at one address).
-- No such property is bridged today, so this is structural risk rather
-- than a present defect -- but when one appears, the property emits two
-- rows with different unit_id, balance and threads_needing_reply, and any
-- count(*) or sum(balance) over the view double-counts it.
--
-- Fixed in two parts, because picking one unit and dropping the other's
-- money would trade a double-count for a silent undercount:
--
--   * unit_id resolves to ONE unit, chosen deterministically (oldest
--     first, id as tiebreak since units.created_at is nullable). This is
--     the FK the row carries and what the UI links to.
--   * balance, oldest_due_date and threads_needing_reply aggregate over
--     EVERY unit bridged to the property, so a duplex reports its whole
--     balance on its single row rather than whichever half won the pick.
--
-- For the 1:1 case -- every property today -- both are identical to the
-- previous behaviour.
--
-- Violations already key off p.id, not unit, so they were never affected.
--
-- Finding 4 -- days_overdue and balance now agree on what is owed.
--
-- oldest_due_date is per-assessment (MIN over assessments with something
-- still outstanding) while balance is the net SUM across all of them, and
-- payments.amount is explicitly allowed to be negative (0039:119). A unit
-- with a credit on one assessment and a smaller unpaid one therefore
-- showed `balance` at or below zero directly beside `days_overdue = 45`,
-- which reads as a data bug on the list.
--
-- days_overdue is now gated on balance > 0: if the property does not owe
-- money on net, nothing about it is overdue. balance keeps its true net
-- meaning -- clamping it to zero instead would hide real credits, which
-- is worse in an AR view. severity_rank already required balance > 0 for
-- rank 2 and is unchanged.

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

  COALESCE(dues.balance, 0)::numeric(14,2)        AS balance,
  dues.oldest_due_date,
  CASE
    WHEN COALESCE(dues.balance, 0) > 0
     AND dues.oldest_due_date IS NOT NULL
     AND dues.oldest_due_date < CURRENT_DATE
      THEN (CURRENT_DATE - dues.oldest_due_date)
    ELSE 0
  END                                             AS days_overdue,

  COALESCE(viol.open_violations, 0)               AS open_violations,
  COALESCE(viol.violations_past_cure, 0)          AS violations_past_cure,
  COALESCE(mail.threads_needing_reply, 0)         AS threads_needing_reply,

  (p.owner_name IS NOT NULL AND btrim(p.owner_name) <> '')   AS has_owner,
  (p.tenure IS NOT NULL AND p.tenure <> 'unknown')           AS has_tenure,
  (u.id IS NOT NULL)                                         AS has_unit_link,

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

-- Exactly one unit per property, deterministically chosen.
LEFT JOIN LATERAL (
  SELECT un.id
  FROM public.units un
  WHERE un.legacy_hoa_property_id = p.id
  ORDER BY un.created_at NULLS LAST, un.id
  LIMIT 1
) u ON TRUE

-- Money aggregates over every bridged unit, not just the chosen one.
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
  WHERE a.unit_id IN (
          SELECT un2.id FROM public.units un2
          WHERE un2.legacy_hoa_property_id = p.id
        )
    AND a.deleted_at IS NULL
    AND a.status IN ('open', 'partial')
) dues ON TRUE

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

-- Threads likewise cover every bridged unit.
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS threads_needing_reply
  FROM public.inbox_threads it
  WHERE it.unit_id IN (
          SELECT un3.id FROM public.units un3
          WHERE un3.legacy_hoa_property_id = p.id
        )
    AND it.organization_id = p.org_id
    AND it.status IN ('needs_review', 'open')
) mail ON TRUE

WHERE p.deleted_at IS NULL
  AND p.org_id IN (
    SELECT om.org_id
    FROM public.org_members om
    WHERE om.user_id = auth.uid()
      AND om.role IN ('admin', 'board')
  );


-- ─── Finding 1: documented, not changed ─────────────────────────────
--
-- The org_id predicate resolves through auth.uid(), which is NULL for a
-- service-role, cron or migration caller. The predicate is then false for
-- every row and the view returns an EMPTY SET rather than an error --
-- verified against production on 2026-08-08: service-role SELECT returned
-- 0 rows while hoa_properties held 184.
--
-- That is indistinguishable from "no properties need attention", so a
-- backfill or cron reading this view would fail silently and look
-- successful -- the same failure the mailbox watchdog exists to prevent.
--
-- Not changed, because nothing server-side reads it. The only consumers
-- are apps/hoa/src/app/(dashboard)/properties/{page,[id]/page}.tsx and
-- lib/properties/list.ts, all of which run on the user-bound client from
-- getSupabaseServerClient(). Adding a SECURITY DEFINER companion for a
-- caller that does not exist would be speculative, and the security
-- reasoning in 0039/0040 is sound as it stands.
--
-- The constraint is recorded on the view itself so it is discoverable
-- from the database rather than only from a migration file.

COMMENT ON VIEW public.hoa_property_list_v IS
  'Attention signals per HOA property, one row per property. '
  'USER CONTEXT ONLY: the org_id predicate resolves through auth.uid(), '
  'so a service-role, cron or migration caller gets an EMPTY SET, not an '
  'error -- which is indistinguishable from "nothing needs attention". '
  'Do not read this view from a job; query hoa_properties directly and '
  'apply your own org scoping. Board/admin only -- see the security notes '
  'in 0039, 0040 and 0045 before relaxing any predicate.';

GRANT SELECT ON public.hoa_property_list_v TO authenticated;
