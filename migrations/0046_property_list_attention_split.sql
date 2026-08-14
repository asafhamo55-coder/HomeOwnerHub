-- 0046_property_list_attention_split.sql
--
-- Splits "needs attention" from "incomplete record" on hoa_property_list_v.
--
-- WHY
--
-- The list's attention filter and its header count were both
-- `severity_rank < 6`. Measured against live data on 2026-08-14:
--
--   rank 1  violation past cure date     11   (6%)
--   rank 3  open violation                4   (2%)
--   rank 5  missing property data       116  (63%)
--   rank 6  nothing outstanding          53  (29%)
--
-- So "131 needing attention" was 116 properties whose only problem is an
-- unset `tenure` dropdown, plus 15 that actually need a human. A filter
-- that selects 71% of the association is not a work queue, and a manager
-- opening the page to find what needs doing had to read past 116 rows of
-- data-entry backlog to reach the 15 that matter.
--
-- Note this corrects the diagnosis in
-- docs/superpowers/reviews/2026-08-09-property-list-severity-signal.md,
-- which inferred from the rendered page that "1 past cure date" fired on
-- nearly every row. It fires on 11 of 184. The list sorts by severity
-- ascending, so those 11 sit at the top -- the review generalised from the
-- visible page rather than the distribution.
--
-- WHAT
--
-- Two boolean columns, appended (CREATE OR REPLACE VIEW permits adding
-- columns only at the end, so column order below is unchanged):
--
--   needs_attention  ranks 1-4: a violation, a past-due balance, or mail
--                    awaiting reply. Something a person must act on.
--   is_incomplete    the record is missing owner, tenure, or a unit link.
--
-- These are deliberately INDEPENDENT, not two halves of one rank.
-- severity_rank is a priority ladder: rank 5 only fires when nothing above
-- it does, so a property with both an open violation and a blank tenure
-- reports rank 3 and its incompleteness is invisible. As its own predicate,
-- is_incomplete stays true for every record that is actually incomplete --
-- which is what a "finish these records" queue needs.
--
-- severity_rank itself is UNCHANGED. It still drives sort order and the
-- dot colour, and rank 5 still renders slate rather than red. Only the
-- attention filter and its count stop treating rank 5 as work.
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
  END                                             AS severity_rank,

  -- Appended in 0046. Order matters: CREATE OR REPLACE VIEW only allows
  -- new columns at the end of the list.

  -- Something a person must act on. Mirrors ranks 1-4 exactly, spelled out
  -- rather than written as `severity_rank IN (1,2,3,4)` because a view
  -- cannot reference its own output column in the same SELECT.
  (
    COALESCE(viol.violations_past_cure, 0) > 0
    OR (COALESCE(dues.balance, 0) > 0
        AND dues.oldest_due_date IS NOT NULL
        AND dues.oldest_due_date < CURRENT_DATE)
    OR COALESCE(viol.open_violations, 0) > 0
    OR COALESCE(mail.threads_needing_reply, 0) > 0
  )                                               AS needs_attention,

  -- Data-entry backlog, independent of the rank ladder above.
  (
    p.owner_name IS NULL
    OR btrim(p.owner_name) = ''
    OR p.tenure IS NULL
    OR p.tenure = 'unknown'
    OR u.id IS NULL
  )                                               AS is_incomplete

FROM public.hoa_properties p

LEFT JOIN LATERAL (
  SELECT un.id
  FROM public.units un
  WHERE un.legacy_hoa_property_id = p.id
  ORDER BY un.created_at NULLS LAST, un.id
  LIMIT 1
) u ON TRUE

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

COMMENT ON VIEW public.hoa_property_list_v IS
  'Attention signals per HOA property, one row per property. '
  'needs_attention (ranks 1-4) is the work queue; is_incomplete is the '
  'data-entry backlog, and the two are independent -- a property can be '
  'both. Do not filter the work queue on severity_rank < 6: rank 5 is '
  'missing data, which was 63% of properties as of 2026-08-14. '
  'USER CONTEXT ONLY: the org_id predicate resolves through auth.uid(), '
  'so a service-role, cron or migration caller gets an EMPTY SET, not an '
  'error -- which is indistinguishable from "nothing needs attention". '
  'Do not read this view from a job; query hoa_properties directly and '
  'apply your own org scoping. Board/admin only -- see the security notes '
  'in 0039, 0040 and 0045 before relaxing any predicate.';

GRANT SELECT ON public.hoa_property_list_v TO authenticated;
