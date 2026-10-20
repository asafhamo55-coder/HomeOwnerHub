-- BL-125 — homes with no association (units.association_id IS NULL).
--
-- OPTIONAL. The app now fixes this itself, so prefer the app:
--   * setUpAssociationCore attaches an org's unassigned homes when it runs
--     ("Set up your association" or "Open the books") and the org has
--     exactly one association;
--   * the dashboard, /properties and /dues show "N homes aren't assigned to
--     an association" with an "Assign them" action for the board (audited).
-- Use this only if Asaf wants existing single-association orgs fixed before
-- any board opens those pages. Never run by an agent (no DB access).
--
-- Output is ids and counts only — no addresses or names.

-- ── 1. Diagnostic (read-only) ─────────────────────────────────────────
-- Per org: unassigned homes and how many associations it has.
SELECT u.organization_id,
       count(*)                                             AS unassigned_units,
       (SELECT count(*) FROM public.associations a
         WHERE a.organization_id = u.organization_id)       AS associations
FROM public.units u
WHERE u.association_id IS NULL
GROUP BY u.organization_id
ORDER BY unassigned_units DESC;

-- associations = 0 → nothing to do; they attach when the org sets one up.
-- associations = 1 → safe to attach (step 2).
-- associations > 1 → do NOT guess; the board assigns from the app notice.

-- ── 2. Backfill (single-association orgs only) — ROLLBACK by default ─
BEGIN;

WITH single AS (
  SELECT organization_id, min(id::text)::uuid AS association_id
  FROM public.associations
  GROUP BY organization_id
  HAVING count(*) = 1
),
moved AS (
  UPDATE public.units u
     SET association_id = s.association_id
    FROM single s
   WHERE u.organization_id = s.organization_id
     AND u.association_id IS NULL
  RETURNING u.organization_id, u.association_id, u.id
),
audited AS (
  INSERT INTO public.audit_log (action, org_id, user_id, entity_type, entity_id, metadata)
  SELECT 'units_association_assigned', organization_id, NULL, 'association', association_id,
         jsonb_build_object('source', 'sql_backfill_2026_10_20', 'count', count(*), 'unit_ids', jsonb_agg(id))
    FROM moved
   GROUP BY organization_id, association_id
  RETURNING org_id, (metadata->>'count')::int AS count
)
SELECT org_id, count FROM audited ORDER BY count DESC;

-- Check the counts above against step 1, then replace ROLLBACK with COMMIT.
ROLLBACK;
