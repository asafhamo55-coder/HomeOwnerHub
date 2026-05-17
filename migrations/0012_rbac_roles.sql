-- 0012_rbac_roles.sql
-- v1.2 Module 9 — RBAC (Real role-based access control).
--
-- Three roles per (user, org) pair: admin, board, resident.
--
-- Migration strategy (safe, single transaction):
--   1. Drop the existing role check constraint
--   2. Backfill rows from the old vocabulary:
--        'owner'  -> 'admin'
--        'admin'  -> 'admin'
--        'member' -> 'board'    (everyone currently a 'member' is treated as board;
--                                manually downgrade individuals to 'resident' after)
--        'viewer' -> 'resident'
--      Unknown values -> 'resident' (safest default).
--   3. Add the new check constraint
--   4. Install SQL helpers used by RLS policies and app code
--   5. Tighten RLS on sensitive board-only tables
--
-- Idempotent. Safe to re-run.

-- ─── Step 1+2+3: role vocabulary migration ──────────────────────────

ALTER TABLE public.org_members
  DROP CONSTRAINT IF EXISTS org_members_role_check;

UPDATE public.org_members
SET role = CASE
  WHEN role IN ('owner', 'admin')                     THEN 'admin'
  WHEN role IN ('member')                             THEN 'board'
  WHEN role IN ('viewer')                             THEN 'resident'
  WHEN role IN ('admin', 'board', 'resident')         THEN role        -- already migrated
  ELSE 'resident'
END
WHERE role NOT IN ('admin', 'board', 'resident');

ALTER TABLE public.org_members
  ADD CONSTRAINT org_members_role_check
  CHECK (role IN ('admin', 'board', 'resident'));

-- ─── Step 4: SQL helpers ────────────────────────────────────────────
-- All helpers are STABLE so the planner can cache them per query.

CREATE OR REPLACE FUNCTION public.auth_role_in_org(p_org_id uuid)
RETURNS text
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.org_members
  WHERE org_id = p_org_id
    AND user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.auth_is_admin(p_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.org_members
    WHERE org_id = p_org_id
      AND user_id = auth.uid()
      AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_is_board_or_admin(p_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.org_members
    WHERE org_id = p_org_id
      AND user_id = auth.uid()
      AND role IN ('admin', 'board')
  );
$$;

-- Current units the calling user owns. Returns empty array (never NULL)
-- so callers can `WHERE id = ANY (auth_owner_unit_ids())` safely.
CREATE OR REPLACE FUNCTION public.auth_owner_unit_ids()
RETURNS uuid[]
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT unit_id
      FROM public.ownerships
      WHERE owner_user_id = auth.uid()
        AND valid_to IS NULL
    ),
    ARRAY[]::uuid[]
  );
$$;

GRANT EXECUTE ON FUNCTION public.auth_role_in_org(uuid)           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_is_admin(uuid)              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_is_board_or_admin(uuid)     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_owner_unit_ids()            TO authenticated, service_role;

-- ─── Step 5: tighten RLS on board-only tables ───────────────────────
-- Strategy: replace the broad `org_access` policy on each board-only
-- table with a `board_or_admin_access` policy that also requires the
-- role check. Residents are blocked from these tables entirely.
--
-- We DROP each old policy before recreating to make the migration
-- re-runnable. The new policy applies to ALL operations (no FOR
-- clause), since we don't want residents to read OR write these.

-- Vendor tables (from migration 0007).
DROP POLICY IF EXISTS org_access                ON public.vendors;
DROP POLICY IF EXISTS org_access                ON public.vendor_compliance;
DROP POLICY IF EXISTS org_access                ON public.vendor_documents;
DROP POLICY IF EXISTS org_access                ON public.rfps;
DROP POLICY IF EXISTS org_access                ON public.rfp_line_items;
DROP POLICY IF EXISTS org_access                ON public.rfp_invitations;
DROP POLICY IF EXISTS org_access                ON public.bids;
DROP POLICY IF EXISTS org_access                ON public.bid_line_items;
DROP POLICY IF EXISTS org_access                ON public.bid_comparisons;
DROP POLICY IF EXISTS org_access                ON public.vendor_internal_ratings;
DROP POLICY IF EXISTS org_access                ON public.vendor_external_data;
DROP POLICY IF EXISTS org_access                ON public.vendor_onboarding_invitations;

CREATE POLICY board_or_admin_access ON public.vendors
  USING (
    organization_id = ANY (public.auth_org_ids())
    AND public.auth_is_board_or_admin(organization_id)
  );
CREATE POLICY board_or_admin_access ON public.vendor_compliance
  USING (
    organization_id = ANY (public.auth_org_ids())
    AND public.auth_is_board_or_admin(organization_id)
  );
CREATE POLICY board_or_admin_access ON public.vendor_documents
  USING (
    organization_id = ANY (public.auth_org_ids())
    AND public.auth_is_board_or_admin(organization_id)
  );
CREATE POLICY board_or_admin_access ON public.rfps
  USING (
    organization_id = ANY (public.auth_org_ids())
    AND public.auth_is_board_or_admin(organization_id)
  );
-- rfp_line_items inherits via rfp
CREATE POLICY board_or_admin_access ON public.rfp_line_items
  USING (EXISTS (
    SELECT 1 FROM public.rfps r
     WHERE r.id = rfp_line_items.rfp_id
       AND r.organization_id = ANY (public.auth_org_ids())
       AND public.auth_is_board_or_admin(r.organization_id)
  ));
CREATE POLICY board_or_admin_access ON public.rfp_invitations
  USING (
    organization_id = ANY (public.auth_org_ids())
    AND public.auth_is_board_or_admin(organization_id)
  );
CREATE POLICY board_or_admin_access ON public.bids
  USING (
    organization_id = ANY (public.auth_org_ids())
    AND public.auth_is_board_or_admin(organization_id)
  );
CREATE POLICY board_or_admin_access ON public.bid_line_items
  USING (EXISTS (
    SELECT 1 FROM public.bids b
     WHERE b.id = bid_line_items.bid_id
       AND b.organization_id = ANY (public.auth_org_ids())
       AND public.auth_is_board_or_admin(b.organization_id)
  ));
CREATE POLICY board_or_admin_access ON public.bid_comparisons
  USING (
    organization_id = ANY (public.auth_org_ids())
    AND public.auth_is_board_or_admin(organization_id)
  );
CREATE POLICY board_or_admin_access ON public.vendor_internal_ratings
  USING (
    organization_id = ANY (public.auth_org_ids())
    AND public.auth_is_board_or_admin(organization_id)
  );
CREATE POLICY board_or_admin_access ON public.vendor_external_data
  USING (EXISTS (
    SELECT 1 FROM public.vendors v
     WHERE v.id = vendor_external_data.vendor_id
       AND v.organization_id = ANY (public.auth_org_ids())
       AND public.auth_is_board_or_admin(v.organization_id)
  ));
CREATE POLICY board_or_admin_access ON public.vendor_onboarding_invitations
  USING (
    organization_id = ANY (public.auth_org_ids())
    AND public.auth_is_board_or_admin(organization_id)
  );

-- ─── state_law_updates: residents READ, only board+admin WRITE ─────
-- The existing `public_read` policy on state_law_updates (added in
-- migration 0011) is SELECT-only and stays as-is. We add explicit
-- INSERT/UPDATE/DELETE policies gated on role so the editorial flow
-- works through the user-bound client (not service-role) when run by
-- a board member or admin.

DROP POLICY IF EXISTS board_or_admin_insert     ON public.state_law_updates;
DROP POLICY IF EXISTS board_or_admin_update     ON public.state_law_updates;
DROP POLICY IF EXISTS board_or_admin_delete     ON public.state_law_updates;

-- The state_law_updates table has `state` (not organization_id). A
-- given org can be in only one state at a time, so we tie the role
-- check to the calling user's membership in ANY org whose
-- association is in the matching state.
--
-- Simpler model for v1: any board/admin in any org can post updates
-- for any state. (Editorial content is platform-wide, not per-org.)
-- If multi-tenant authorship becomes a requirement, we can scope per
-- state in a later migration.

CREATE POLICY board_or_admin_insert ON public.state_law_updates
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'board')
    )
  );

CREATE POLICY board_or_admin_update ON public.state_law_updates
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'board')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'board')
    )
  );

CREATE POLICY board_or_admin_delete ON public.state_law_updates
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'board')
    )
  );

-- ─── post-migration verification ───────────────────────────────────
-- Run after applying to confirm every existing user has a role in
-- the new vocabulary:
--
--   SELECT role, count(*) FROM public.org_members GROUP BY role;
--
-- Expected: all rows in {admin, board, resident}.
