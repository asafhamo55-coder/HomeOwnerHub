-- 0041_property_residents_write_gate.sql
--
-- Close the write hole on property_residents.
--
-- The policy from 0017 is:
--
--   CREATE POLICY org_access ON public.property_residents
--     USING (organization_id = ANY (public.auth_org_ids()));
--
-- It is FOR ALL with no WITH CHECK, so Postgres reuses the USING expression
-- as the check. That means ANY member of the org — including someone whose
-- role is `resident` — can INSERT, UPDATE or DELETE any resident row in
-- their org: change a neighbour's email, mark an owner moved out, or delete
-- the record outright. The application-level gates added to addResident,
-- updateResident and removeResident close every path the app itself
-- exposes, but they are app-level; anyone with the anon key and a session
-- can still call PostgREST directly. This is the database-level fix.
--
-- NOT modelled on the vendors policy from 0012. That one locks BOTH read
-- and write to board/admin, which would be wrong here: the resident portal
-- reads this table as the signed-in resident to resolve their own unit
-- (apps/hoa/src/lib/resident.ts:125, a SELECT by email). Locking reads
-- would break portal sign-in for any resident with no `ownerships` row.
-- So reads stay org-wide and only writes are gated.
--
-- Read scope is deliberately UNCHANGED from 0017 — still any org member.
-- Narrowing it (e.g. to "your own row") is a separate question with its own
-- blast radius across the portal, communications audiences and the matcher;
-- this migration fixes the write hole and nothing else.
--
-- Audited before writing (every writer of property_residents):
--   apps/hoa/src/lib/property-residents.ts  addResident / updateResident /
--       removeResident — user client, all three now require board/admin
--   apps/hoa/src/lib/members.ts:333,343     inviteMember — SERVICE-ROLE
--       client (`admin`), which bypasses RLS entirely and is unaffected
--   apps/hoa/src/lib/resident.ts:125        SELECT only
--   packages/jobs, scripts/                 service-role, unaffected
-- No non-board/admin user-client writer exists, so nothing legitimate
-- breaks.

DROP POLICY IF EXISTS org_access ON public.property_residents;

-- Reads: unchanged from 0017 — any member of the org.
CREATE POLICY org_read ON public.property_residents
  FOR SELECT
  USING (organization_id = ANY (public.auth_org_ids()));

-- Writes: board or admin only. Split per-command rather than FOR ALL so
-- that INSERT gets a WITH CHECK and UPDATE gets both — a FOR ALL policy
-- with only USING is exactly the bug being fixed here.
CREATE POLICY board_or_admin_insert ON public.property_residents
  FOR INSERT
  WITH CHECK (
    organization_id = ANY (public.auth_org_ids())
    AND public.auth_is_board_or_admin(organization_id)
  );

CREATE POLICY board_or_admin_update ON public.property_residents
  FOR UPDATE
  USING (
    organization_id = ANY (public.auth_org_ids())
    AND public.auth_is_board_or_admin(organization_id)
  )
  WITH CHECK (
    organization_id = ANY (public.auth_org_ids())
    AND public.auth_is_board_or_admin(organization_id)
  );

-- UPDATE needs WITH CHECK as well as USING: USING decides which rows may be
-- targeted, WITH CHECK decides what they may be changed INTO. Without it a
-- permitted caller could move a row to another organization_id.

CREATE POLICY board_or_admin_delete ON public.property_residents
  FOR DELETE
  USING (
    organization_id = ANY (public.auth_org_ids())
    AND public.auth_is_board_or_admin(organization_id)
  );
