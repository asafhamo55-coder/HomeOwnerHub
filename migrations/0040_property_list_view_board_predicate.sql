-- 0040_property_list_view_board_predicate.sql
-- Replaces the per-row auth_is_board_or_admin() call in
-- hoa_property_list_v with an equivalent subquery that Postgres evaluates
-- ONCE instead of once per property row.
--
-- WHY
--
-- auth_is_board_or_admin is SECURITY DEFINER, which Postgres cannot inline.
-- It therefore ran as a separate function call for every candidate row. A
-- 5,000-property EXPLAIN (ANALYZE) measured on 2026-08-06 showed:
--
--   Index Scan on hoa_properties  (actual time=0.453..94.540 rows=5000)
--     Filter: ((deleted_at IS NULL) AND auth_is_board_or_admin(org_id))
--
-- 94.5 ms of a 136.9 ms total — 69% of the query — spent in that filter,
-- at roughly 19 microseconds per row. The rewrite below turns it into a
-- hashed semi-join computed once.
--
-- SECURITY — this is NOT a relaxation.
--
-- auth_is_board_or_admin(p_org_id) is exactly:
--     EXISTS (SELECT 1 FROM org_members
--             WHERE org_id = p_org_id AND user_id = auth.uid()
--               AND role IN ('admin','board'))
-- The predicate below is the same membership test expressed as a set.
--
-- One deliberate difference: the function is SECURITY DEFINER and so reads
-- org_members bypassing RLS, whereas this subquery runs as the invoker and
-- is subject to org_members' own org_member_access policy. That policy can
-- only ever return FEWER rows to the caller, never more — so this change
-- can only make the view more restrictive, never less. It fails closed,
-- which is the correct direction for a security predicate.
--
-- security_invoker = on is preserved. Column list, order and types are
-- unchanged, which is what CREATE OR REPLACE VIEW requires.
--
-- Idempotent. Safe to re-run.

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

LEFT JOIN public.units u
  ON u.legacy_hoa_property_id = p.id

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

LEFT JOIN LATERAL (
  SELECT COUNT(*) AS threads_needing_reply
  FROM public.inbox_threads it
  WHERE it.unit_id = u.id
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

COMMENT ON VIEW public.hoa_property_list_v IS
  'Attention signals per HOA property. Board/admin only — see the security notes in 0039 and 0040 before relaxing any predicate.';

GRANT SELECT ON public.hoa_property_list_v TO authenticated;
