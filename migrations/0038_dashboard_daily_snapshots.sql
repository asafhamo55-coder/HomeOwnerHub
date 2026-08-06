-- 0038_dashboard_daily_snapshots.sql
-- One row per org per day recording what the dashboard's headline numbers
-- looked like, so the digest can say "down 4 from yesterday" and the tiles
-- can grow trend arrows later.
--
-- Why a table and not a column on hoa_digests: hoa_digests is PK'd on
-- org_id — one row per org, overwritten on every refresh. The digest card
-- refreshes during the day, so single-row storage would move the delta
-- baseline forward and the delta would read "0 new" for the rest of the day.
--
-- The unique index makes a same-day re-write a no-op (ON CONFLICT DO
-- NOTHING at the call site). The delta baseline is always the most recent
-- row with captured_on < today, so within-day writes never disturb it.
--
-- Idempotent. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.dashboard_daily_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  captured_on     date NOT NULL,
  counts          jsonb NOT NULL,
  captured_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS dashboard_daily_snapshots_org_day_uniq
  ON public.dashboard_daily_snapshots(organization_id, captured_on);

-- Baseline lookup is "most recent row for this org before today".
CREATE INDEX IF NOT EXISTS dashboard_daily_snapshots_org_day_idx
  ON public.dashboard_daily_snapshots(organization_id, captured_on DESC);

ALTER TABLE public.dashboard_daily_snapshots ENABLE ROW LEVEL SECURITY;

-- Board/admin read only. `auth_org_ids()` alone would expose these counts
-- (open violations, dues outstanding) to every resident of the association
-- — the exact role-free gap 0036_ai_runs_board_only.sql was written to
-- close on ai_runs. Writes go through the service role, which bypasses RLS,
-- so no INSERT policy is needed.
DROP POLICY IF EXISTS org_access ON public.dashboard_daily_snapshots;

CREATE POLICY org_access ON public.dashboard_daily_snapshots
  FOR SELECT
  USING (organization_id = ANY (public.auth_org_ids())
         AND public.auth_is_board_or_admin(organization_id));
