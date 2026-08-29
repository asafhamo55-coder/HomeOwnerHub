-- 0051_property_list_waiting_list.sql
--
-- Adds `on_waiting_list` to hoa_property_list_v so /properties can offer a
-- "Waiting list" filter chip beside Leased.
--
-- Why a view column and not another round trip: 6eece14 added the waiting
-- list PILL by calling getOpenWaitingListEntries() on the ids of the ~50
-- rows already fetched. That is fine for decoration and needs no schema
-- change, but it cannot back a filter. listProperties applies the filter
-- inside the paginated query and asks for count: 'exact' to drive the
-- pager; filtering after the fact would page over the wrong total.
--
-- The whole view body below is 0046 verbatim, with exactly two additions:
-- the `on_waiting_list` output column (last in the select list) and the
-- `wl` lateral that feeds it. CREATE OR REPLACE VIEW cannot reorder or
-- drop columns, only append -- so every existing column keeps its
-- position and existing readers are unaffected.
--
-- SECURITY: unchanged from 0046. Still security_invoker = on, still
-- board/admin-only through the auth.uid() predicate, so a service-role or
-- migration caller still gets an EMPTY SET rather than an error. Verify
-- this migration through information_schema.columns, NOT by selecting
-- rows -- an empty result proves nothing here.
--
-- RLS on lease_waiting_list (0017: organization_id = ANY(auth_org_ids()))
-- applies to the new lateral under security_invoker, so the column cannot
-- leak an entry across orgs.
--
-- Idempotent. Safe to re-run.
-- Reverting = re-running 0046 unchanged.

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
  )                                               AS is_incomplete,

  -- Appended in 0051. Same rule as 0046's block above: CREATE OR REPLACE
  -- VIEW only permits new columns at the END of the select list, so this
  -- goes last and every column above keeps its position.
  --
  -- Exists so /properties can FILTER on the waiting list, not merely
  -- decorate rows with it. The pill shipped in 6eece14 was painted from a
  -- side lookup over the ~50 visible ids, which cannot drive a filter: the
  -- filter runs inside the paginated query and its count: 'exact' total
  -- feeds the pager, so rows excluded after the fact would leave the pager
  -- counting rows the list no longer shows.
  (wl.entry_id IS NOT NULL)                       AS on_waiting_list

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

LEFT JOIN LATERAL (
  -- At most one open entry per property is guaranteed by
  -- lease_waiting_list_one_open_per_property_idx (0017), a partial unique
  -- index on (property_id) WHERE status = 'waiting' -- which this predicate
  -- matches exactly, so it is an index probe rather than a scan.
  --
  -- Deliberately NOT scoped by association_id: that index is on property_id
  -- alone, and addToWaitingList stamps getPrimaryAssociation() -- the org's
  -- alphabetically-first association -- so renaming or adding one strands
  -- older rows under a stale association_id. Matching the index keeps this
  -- column agreeing with listWaitingListCandidates, which excludes the same
  -- way for the same reason.
  SELECT lwl.id AS entry_id
  FROM public.lease_waiting_list lwl
  WHERE lwl.property_id = p.id
    AND lwl.status = 'waiting'
  LIMIT 1
) wl ON TRUE

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
  'in 0039, 0040 and 0045 before relaxing any predicate. '
  'on_waiting_list (0051) is true when the property holds an open '
  'lease_waiting_list entry; it is matched to that table''s partial unique '
  'index on (property_id) WHERE status = ''waiting'', NOT scoped by '
  'association_id -- see the lateral''s comment for why.';

GRANT SELECT ON public.hoa_property_list_v TO authenticated;
