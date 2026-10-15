-- 0058_org_members_role_scope.sql
--
-- Closes same-org privilege escalation on org_members.
--
-- 0054 removed the cross-tenant half. What survived was
--
--   CREATE POLICY org_member_access ON public.org_members
--   USING ((org_id = ANY (public.auth_org_ids())));
--
-- a FOR ALL policy whose only predicate is "you belong to this org". With
-- no explicit WITH CHECK, that expression also gates INSERT and UPDATE, so
-- any member — a plain resident included — could grant themselves admin in
-- their own org through a direct anon-key + session call. Only the
-- application-layer requireBoardOrAdmin() gate stood in the way.
--
-- Replaced with one policy per command, matching what the app already does
-- (apps/hoa/src/lib/members.ts):
--
--   SELECT  any member of the org (unchanged — the members page, role
--           lookups in auth.ts and audience resolution all read this).
--   INSERT  admin: any role. board: residents only (inviteMember already
--           refuses "Board members can only invite residents").
--   UPDATE  admin: any row, any role. board: resident rows, kept resident
--           (attachToOrg's re-invite fallback updates the role in place).
--   DELETE  admin: any row. board: resident rows only.
--
-- auth_is_admin / auth_is_board_or_admin (0012) are SECURITY DEFINER, so
-- they read org_members without re-entering these policies.
--
-- Every other write path — onboarding in all three apps and the
-- platform-admin "create org" flow — uses the service-role client and is
-- unaffected. No database-level last-admin guard is added here; the app
-- enforces it, and moving it into the schema is a separate change.
--
-- Idempotent. Runs as ONE statement — see 0048's header for why anything
-- multi-statement is unreliable in the Supabase editor.

DO $mig$
BEGIN
  DROP POLICY IF EXISTS org_member_access      ON public.org_members;
  DROP POLICY IF EXISTS org_members_select     ON public.org_members;
  DROP POLICY IF EXISTS org_members_insert     ON public.org_members;
  DROP POLICY IF EXISTS org_members_update     ON public.org_members;
  DROP POLICY IF EXISTS org_members_delete     ON public.org_members;

  CREATE POLICY org_members_select ON public.org_members
    FOR SELECT TO authenticated
    USING (org_id = ANY (public.auth_org_ids()));

  CREATE POLICY org_members_insert ON public.org_members
    FOR INSERT TO authenticated
    WITH CHECK (
      public.auth_is_admin(org_id)
      OR (public.auth_is_board_or_admin(org_id) AND role = 'resident')
    );

  CREATE POLICY org_members_update ON public.org_members
    FOR UPDATE TO authenticated
    USING (
      public.auth_is_admin(org_id)
      OR (public.auth_is_board_or_admin(org_id) AND role = 'resident')
    )
    WITH CHECK (
      public.auth_is_admin(org_id)
      OR (public.auth_is_board_or_admin(org_id) AND role = 'resident')
    );

  CREATE POLICY org_members_delete ON public.org_members
    FOR DELETE TO authenticated
    USING (
      public.auth_is_admin(org_id)
      OR (public.auth_is_board_or_admin(org_id) AND role = 'resident')
    );

  RAISE NOTICE '0058 ok: org_members has per-command role-scoped policies.';
END
$mig$;
