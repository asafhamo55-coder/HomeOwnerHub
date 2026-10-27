-- 0071_m6_roles.sql — migration batch M6 (BL-168 professional and officer
-- roles: CPA, Attorney, Treasurer; BL-156 and BL-166 append their own parts)
--
-- Apply: docs/specs/2026-10-20-sql-runbook.md, Section M. Design:
-- docs/specs/2026-10-26-professional-roles.md. Needs org_members (0000,
-- 0012, 0058), auth_is_board_or_admin(uuid) (0012), auth_org_ids() (0000),
-- approval_requests (0060), the money tables (0006, 0061), collection_cases
-- and collection_events (0047), hoa_violations (0000), violation_hearings
-- (0068), tickets (0024, records requests since 0066), units and
-- ownerships (0004), governing_documents (0004) and
-- compliance_deadlines_done (0067), all asserted below.
--
-- Hardened after the security review (2026-10-26), all in this file:
--   * sign-offs are cleared when a request's payload or amount changes;
--     only CURRENT admin/board signers count, never the proposer; every
--     money action type is covered (approval_is_money_action) and can only
--     be inserted as 'proposed'; an amount-less money item needs two;
--   * only an admin changes associations.dual_control_cents (audited);
--   * a violation assignment resolves to ONE home (oldest unit) when
--     written (matter_assignments.unit_id);
--   * a professional reads no orgs/associations row (pro_org_info());
--   * a grant lasts at most a year, org_members changes for cpa/attorney
--     are audited, memberships cannot be moved, and removing a
--     professional ends their assignments and rejects their pending items;
--   * professional_invites: invitations for existing accounts grant nothing
--     until accepted through a signed link.
--
-- Numbering: 0070 is the tenant-isolation hardening migration (BL-175b,
-- 0070_tenant_isolation.sql), applied FIRST; this file is 0071 and must
-- come after it. Both recreate auth_org_ids(): this file's version keeps the
-- members-only role filter and must also keep 0070's suspended/archived
-- filter, search_path and guards when the two are merged.
--
-- Second review (2026-10-26): the invite row's link expiry and creation time
-- are forced, an un-revoke is refused, an invite's end date is capped;
-- dual-control guard also watches organization_id and audits inserts;
-- approval_requests.action_type and organization_id are immutable; only the
-- service role (the invite flow) creates or upgrades a cpa/attorney row; an
-- item from a professional whose grant ended cannot be approved; leaving the
-- board clears the officer title.
--
-- Idempotent (safe to run any number of times).
--
-- The spec says `memberships`; the table in this schema is org_members
-- (primary key org_id, user_id), so every "membership_id" in the spec is
-- the pair (organization_id, user_id) here.
--
--   1. org_members: role may also be 'cpa' or 'attorney'; officer_title
--      (president, vice_president, secretary, treasurer, director; board
--      members only); access_expires_at (required for cpa and attorney;
--      an expired grant is no access anywhere below); general_counsel (an
--      attorney the board has given the governing documents and the
--      compliance record). The 0058 policies let board/admin write
--      resident, cpa and attorney rows (before: residents only); admin
--      still writes every row, and only admin writes board and admin
--      rows, so officer titles stay admin-set.
--   2. auth_org_ids() stops listing orgs where the caller is only a cpa or
--      attorney. Dozens of "members read" policies (associations incl. the
--      Zelle recipient, recurring events, templates, ...) are written as
--      org = ANY(auth_org_ids()); a professional must not inherit them.
--      Their reads are the explicit policies in part 5, never membership.
--   3. matter_assignments: which attorney sees which collections case,
--      violation (and its hearing) or records request. Board/admin write;
--      an attorney reads their own active rows. The attorney must be an
--      attorney member of the row's org and the matter must be the org's
--      (trigger, 23503, also for the service role).
--   4. approval_requests.proposed_by, approval_signoffs and
--      record_approval_signoff(): who proposed an item (a professional
--      reads only their own proposals) and who has signed off a money
--      approval. A BEFORE UPDATE trigger refuses to approve a money item
--      above the association's dual_control_cents (new column on
--      associations, null = no dual control) unless two different
--      board/admin members have signed it off (23514).
--   5. Read policies (SELECT only, no write policy for professionals):
--        cpa       funds, chart_of_accounts, fiscal_periods,
--                  journal_entries, ledger_entries, budgets,
--                  budget_line_items, bank_accounts, bank_transactions,
--                  bank_reconciliations, assessments, payments, invoices,
--                  payment_plans, recurring_journal_entries,
--                  adjusting_entries, closing_entries
--        attorney  the assigned collection_cases / collection_events /
--                  hoa_violations / violation_hearings / records-request
--                  tickets, the assessments and payments of the assigned
--                  units, the board's collections letters for assigned
--                  cases; general counsel: governing_documents and
--                  compliance_deadlines_done
--        both      their own org_members row, their org's name, and their
--                  own proposals (approval_requests.proposed_by)
--      Owner names (cpa) and the owner name and home address of an
--      assigned matter (attorney) come through two SECURITY DEFINER
--      functions that return those columns only; ownerships and units are
--      not readable by a professional.
--
-- Every SECURITY DEFINER function below refuses a caller with no session
-- in its own body (42501): a later blanket GRANT on routines (CI's schema
-- replay re-grants all of them to anon) must not reopen them.
--
-- App code reads and writes none of this until M6_APPLIED
-- (packages/db/src/m6.ts) is flipped. All-or-nothing.

BEGIN;

DO $pre$
BEGIN
  IF to_regprocedure('public.tenant_fk_same_org()') IS NULL THEN
    RAISE EXCEPTION '0071: tenant_fk_same_org() is missing; apply 0070_tenant_isolation.sql first';
  END IF;
  IF to_regclass('public.org_members') IS NULL THEN
    RAISE EXCEPTION '0071: org_members is missing';
  END IF;
  IF to_regprocedure('public.auth_is_board_or_admin(uuid)') IS NULL THEN
    RAISE EXCEPTION '0071: auth_is_board_or_admin(uuid) is missing (0012)';
  END IF;
  IF to_regprocedure('public.auth_is_admin(uuid)') IS NULL THEN
    RAISE EXCEPTION '0071: auth_is_admin(uuid) is missing (0012)';
  END IF;
  IF to_regprocedure('public.auth_org_ids()') IS NULL THEN
    RAISE EXCEPTION '0071: auth_org_ids() is missing (0000)';
  END IF;
  IF to_regclass('public.approval_requests') IS NULL THEN
    RAISE EXCEPTION '0071: approval_requests is missing (0060)';
  END IF;
  IF to_regclass('public.journal_entries') IS NULL OR to_regclass('public.assessments') IS NULL
     OR to_regclass('public.adjusting_entries') IS NULL OR to_regclass('public.budget_line_items') IS NULL THEN
    RAISE EXCEPTION '0071: the accounting tables are missing (0006, 0061)';
  END IF;
  IF to_regclass('public.collection_cases') IS NULL OR to_regclass('public.collection_events') IS NULL THEN
    RAISE EXCEPTION '0071: collection_cases / collection_events are missing (0047)';
  END IF;
  IF to_regclass('public.violation_hearings') IS NULL THEN
    RAISE EXCEPTION '0071: violation_hearings is missing (0068)';
  END IF;
  IF to_regclass('public.hoa_violations') IS NULL OR to_regclass('public.tickets') IS NULL THEN
    RAISE EXCEPTION '0071: hoa_violations / tickets are missing';
  END IF;
  IF to_regclass('public.units') IS NULL OR to_regclass('public.ownerships') IS NULL THEN
    RAISE EXCEPTION '0071: units / ownerships are missing (0004)';
  END IF;
  IF to_regclass('public.governing_documents') IS NULL THEN
    RAISE EXCEPTION '0071: governing_documents is missing (0004)';
  END IF;
  IF to_regclass('public.compliance_deadlines_done') IS NULL THEN
    RAISE EXCEPTION '0071: compliance_deadlines_done is missing (0067)';
  END IF;
END $pre$;

-- ── 1. org_members: roles, officer title, expiry ──────────────────────
ALTER TABLE public.org_members DROP CONSTRAINT IF EXISTS org_members_role_check;
ALTER TABLE public.org_members
  ADD CONSTRAINT org_members_role_check
  CHECK (role IN ('admin', 'board', 'resident', 'cpa', 'attorney'));

ALTER TABLE public.org_members ADD COLUMN IF NOT EXISTS officer_title text;
ALTER TABLE public.org_members ADD COLUMN IF NOT EXISTS access_expires_at timestamptz;
ALTER TABLE public.org_members ADD COLUMN IF NOT EXISTS general_counsel boolean NOT NULL DEFAULT false;

ALTER TABLE public.org_members DROP CONSTRAINT IF EXISTS org_members_officer_title_check;
ALTER TABLE public.org_members
  ADD CONSTRAINT org_members_officer_title_check
  CHECK (officer_title IS NULL
         OR (role = 'board'
             AND officer_title IN ('president', 'vice_president', 'secretary', 'treasurer', 'director')));

ALTER TABLE public.org_members DROP CONSTRAINT IF EXISTS org_members_pro_expiry_check;
ALTER TABLE public.org_members
  ADD CONSTRAINT org_members_pro_expiry_check
  CHECK (role NOT IN ('cpa', 'attorney') OR access_expires_at IS NOT NULL);

ALTER TABLE public.org_members DROP CONSTRAINT IF EXISTS org_members_general_counsel_check;
ALTER TABLE public.org_members
  ADD CONSTRAINT org_members_general_counsel_check
  CHECK (NOT general_counsel OR role = 'attorney');

COMMENT ON COLUMN public.org_members.officer_title IS
  'BL-168: board officer title (president, vice_president, secretary, treasurer, director). Board members only; admin-set.';
COMMENT ON COLUMN public.org_members.access_expires_at IS
  'BL-168: when a cpa or attorney grant ends. Required for those roles; an expired grant reads nothing.';

-- Who may write which org_members rows (0058 shape + professionals).
DO $mig$
BEGIN
  DROP POLICY IF EXISTS org_members_insert ON public.org_members;
  DROP POLICY IF EXISTS org_members_update ON public.org_members;
  DROP POLICY IF EXISTS org_members_delete ON public.org_members;
  DROP POLICY IF EXISTS org_members_select_self ON public.org_members;

  CREATE POLICY org_members_insert ON public.org_members
    FOR INSERT TO authenticated
    WITH CHECK (
      public.auth_is_admin(org_id)
      OR (public.auth_is_board_or_admin(org_id) AND role IN ('resident', 'cpa', 'attorney'))
    );
  CREATE POLICY org_members_update ON public.org_members
    FOR UPDATE TO authenticated
    USING (
      public.auth_is_admin(org_id)
      OR (public.auth_is_board_or_admin(org_id) AND role IN ('resident', 'cpa', 'attorney'))
    )
    WITH CHECK (
      public.auth_is_admin(org_id)
      OR (public.auth_is_board_or_admin(org_id) AND role IN ('resident', 'cpa', 'attorney'))
    );
  CREATE POLICY org_members_delete ON public.org_members
    FOR DELETE TO authenticated
    USING (
      public.auth_is_admin(org_id)
      OR (public.auth_is_board_or_admin(org_id) AND role IN ('resident', 'cpa', 'attorney'))
    );
  -- Everyone reads their own row (a professional is in no org list below).
  CREATE POLICY org_members_select_self ON public.org_members
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());
END
$mig$;

-- ── 2. auth_org_ids(): members only, not professionals ────────────────
-- 0070's definition (suspended/archived orgs excluded, search_path, null-uid
-- guard, REVOKE) with ONE addition: the role filter. If 0070 changes this
-- function again, change both.
CREATE OR REPLACE FUNCTION public.auth_org_ids()
RETURNS uuid[]
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE(
    ARRAY(
      SELECT m.org_id
        FROM public.org_members m
        JOIN public.orgs o ON o.id = m.org_id
       WHERE auth.uid() IS NOT NULL
         AND m.user_id = auth.uid()
         AND m.role IN ('admin', 'board', 'resident')
         AND o.suspended_at IS NULL
         AND o.archived_at IS NULL
    ),
    '{}'::uuid[]
  );
$fn$;

REVOKE ALL ON FUNCTION public.auth_org_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_org_ids() TO authenticated, service_role;

-- ── 2b. professional helpers (each refuses a null auth.uid()) ──────────
-- An ACTIVE grant: a cpa or attorney row whose expiry is in the future.
CREATE OR REPLACE FUNCTION public.auth_pro_active(p_org_id uuid, p_role text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth_pro_active: sign in first' USING errcode = '42501';
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.org_members m
      JOIN public.orgs o ON o.id = m.org_id AND o.suspended_at IS NULL AND o.archived_at IS NULL
     WHERE m.org_id = p_org_id
       AND m.user_id = auth.uid()
       AND m.role IN ('cpa', 'attorney')
       AND (p_role IS NULL OR m.role = p_role)
       AND m.access_expires_at IS NOT NULL
       AND m.access_expires_at > now()
  );
END;
$fn$;

-- Any professional row, expired or not (the org's name stays readable so
-- the app can say "your access to <HOA> ended").
CREATE OR REPLACE FUNCTION public.auth_has_pro_membership(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth_has_pro_membership: sign in first' USING errcode = '42501';
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.org_members m
     WHERE m.org_id = p_org_id
       AND m.user_id = auth.uid()
       AND m.role IN ('cpa', 'attorney')
  );
END;
$fn$;

-- ── 3. matter_assignments ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.matter_assignments (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  user_id          uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  matter_type      text        NOT NULL
                               CHECK (matter_type IN ('collections_case', 'violation', 'records_request')),
  matter_id        uuid        NOT NULL,
  -- Resolved by the scope trigger when the row is written; never client-supplied.
  unit_id          uuid        REFERENCES public.units(id) ON DELETE SET NULL,
  created_by       uuid        REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  revoked_at       timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS matter_assignments_live_uniq
  ON public.matter_assignments (organization_id, user_id, matter_type, matter_id)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS matter_assignments_user_idx
  ON public.matter_assignments (user_id, organization_id)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS matter_assignments_matter_idx
  ON public.matter_assignments (matter_type, matter_id);

COMMENT ON TABLE public.matter_assignments IS
  'BL-168: which attorney sees which matter (collections case, violation, records request). Board/admin write; an attorney reads their own active rows.';

-- The FKs prove the org and the user exist; this proves the user is an
-- attorney member of THIS org and the matter is this org's, and resolves
-- the matter to exactly ONE home (unit_id) once, here: a violation's home
-- is the oldest unit on its property (created_at, then id: the 0045
-- rule), so a property with two unit rows can never widen what the
-- attorney sees. The client's unit_id is always overwritten.
CREATE OR REPLACE FUNCTION public.matter_assignments_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.org_members m
                  WHERE m.org_id = new.organization_id
                    AND m.user_id = new.user_id
                    AND m.role = 'attorney') THEN
    RAISE EXCEPTION 'matter_assignments: the person is not an attorney of this organization'
      USING errcode = '23503';
  END IF;
  new.unit_id := NULL;
  IF new.matter_type = 'collections_case' THEN
    SELECT c.unit_id INTO new.unit_id
      FROM public.collection_cases c
     WHERE c.id = new.matter_id AND c.organization_id = new.organization_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'matter_assignments: the collections case is not in this organization'
        USING errcode = '23503';
    END IF;
  ELSIF new.matter_type = 'violation' THEN
    IF NOT EXISTS (SELECT 1 FROM public.hoa_violations v
                    WHERE v.id = new.matter_id AND v.org_id = new.organization_id) THEN
      RAISE EXCEPTION 'matter_assignments: the violation is not in this organization'
        USING errcode = '23503';
    END IF;
    SELECT x.id INTO new.unit_id
      FROM public.hoa_violations v
      JOIN public.units x ON x.legacy_hoa_property_id = v.property_id AND x.organization_id = v.org_id
     WHERE v.id = new.matter_id
     ORDER BY x.created_at, x.id
     LIMIT 1;
  ELSE
    SELECT t.unit_id INTO new.unit_id
      FROM public.tickets t
     WHERE t.id = new.matter_id AND t.organization_id = new.organization_id
       AND t.category = 'records_request';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'matter_assignments: the records request is not in this organization'
        USING errcode = '23503';
    END IF;
  END IF;
  RETURN new;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.matter_assignments_scope() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS matter_assignments_scope ON public.matter_assignments;
CREATE TRIGGER matter_assignments_scope
  BEFORE INSERT OR UPDATE OF organization_id, user_id, matter_type, matter_id, unit_id ON public.matter_assignments
  FOR EACH ROW EXECUTE FUNCTION public.matter_assignments_scope();

-- created_by is the caller for a signed-in user and never changes (as
-- 0067/0068 SEC-N6). SECURITY INVOKER on purpose: current_user matters.
CREATE OR REPLACE FUNCTION public.matter_assignments_attribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF current_user = 'authenticated' THEN
    IF tg_op = 'INSERT' THEN
      new.created_by := auth.uid();
    ELSE
      new.created_by := old.created_by;
    END IF;
  END IF;
  RETURN new;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.matter_assignments_attribution() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS matter_assignments_attribution ON public.matter_assignments;
CREATE TRIGGER matter_assignments_attribution
  BEFORE INSERT OR UPDATE ON public.matter_assignments
  FOR EACH ROW EXECUTE FUNCTION public.matter_assignments_attribution();

-- The home must be the assignment's own org's (tenant_fk_same_org, 0070).
-- Named so it fires after matter_assignments_scope, which resolves unit_id.
-- matter_id is polymorphic (no foreign key); the scope trigger above checks
-- it against the right table's organization.
DROP TRIGGER IF EXISTS matter_assignments_unit_id_org_scope ON public.matter_assignments;
CREATE TRIGGER matter_assignments_unit_id_org_scope
  BEFORE INSERT OR UPDATE OF unit_id, organization_id ON public.matter_assignments
  FOR EACH ROW EXECUTE FUNCTION public.tenant_fk_same_org('unit_id', 'units', 'organization_id', 'organization_id');

-- Does the calling attorney hold an active grant AND a live assignment?
CREATE OR REPLACE FUNCTION public.auth_attorney_has_matter(p_org_id uuid, p_matter_type text, p_matter_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth_attorney_has_matter: sign in first' USING errcode = '42501';
  END IF;
  RETURN EXISTS (
    SELECT 1
      FROM public.matter_assignments a
      JOIN public.org_members m
        ON m.org_id = a.organization_id AND m.user_id = a.user_id
      JOIN public.orgs o ON o.id = m.org_id AND o.suspended_at IS NULL AND o.archived_at IS NULL
     WHERE a.organization_id = p_org_id
       AND a.user_id = auth.uid()
       AND a.matter_type = p_matter_type
       AND a.matter_id = p_matter_id
       AND a.revoked_at IS NULL
       AND m.role = 'attorney'
       AND m.access_expires_at IS NOT NULL
       AND m.access_expires_at > now()
  );
END;
$fn$;

-- The ids of the caller's live assignments of one matter type, while the
-- attorney grant is active (else empty). Policies call it as
-- `id = ANY ((SELECT ...))` so it runs once per query, not once per row.
CREATE OR REPLACE FUNCTION public.auth_attorney_matter_ids(p_matter_type text)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth_attorney_matter_ids: sign in first' USING errcode = '42501';
  END IF;
  RETURN COALESCE(ARRAY(
    SELECT a.matter_id
      FROM public.matter_assignments a
      JOIN public.org_members m
        ON m.org_id = a.organization_id AND m.user_id = a.user_id
      JOIN public.orgs o ON o.id = m.org_id AND o.suspended_at IS NULL AND o.archived_at IS NULL
     WHERE a.user_id = auth.uid()
       AND a.matter_type = p_matter_type
       AND a.revoked_at IS NULL
       AND m.role = 'attorney'
       AND m.access_expires_at IS NOT NULL
       AND m.access_expires_at > now()
  ), ARRAY[]::uuid[]);
END;
$fn$;

-- The homes of the caller's live assignments (resolved once, when the
-- assignment was written), across the orgs where the grant is active.
-- Ids only.
CREATE OR REPLACE FUNCTION public.auth_attorney_unit_ids()
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth_attorney_unit_ids: sign in first' USING errcode = '42501';
  END IF;
  RETURN COALESCE(ARRAY(
    SELECT a.unit_id
      FROM public.matter_assignments a
      JOIN public.org_members m
        ON m.org_id = a.organization_id AND m.user_id = a.user_id
      JOIN public.orgs o ON o.id = m.org_id AND o.suspended_at IS NULL AND o.archived_at IS NULL
     WHERE a.user_id = auth.uid()
       AND a.revoked_at IS NULL
       AND a.unit_id IS NOT NULL
       AND m.role = 'attorney'
       AND m.access_expires_at IS NOT NULL
       AND m.access_expires_at > now()
  ), ARRAY[]::uuid[]);
END;
$fn$;

-- The org ids where the caller has an ACTIVE professional grant (of one
-- role, or either).
CREATE OR REPLACE FUNCTION public.auth_pro_org_ids(p_role text DEFAULT NULL)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth_pro_org_ids: sign in first' USING errcode = '42501';
  END IF;
  RETURN COALESCE(ARRAY(
    SELECT m.org_id FROM public.org_members m
      JOIN public.orgs o ON o.id = m.org_id AND o.suspended_at IS NULL AND o.archived_at IS NULL
     WHERE m.user_id = auth.uid()
       AND m.role IN ('cpa', 'attorney')
       AND (p_role IS NULL OR m.role = p_role)
       AND m.access_expires_at IS NOT NULL
       AND m.access_expires_at > now()
  ), ARRAY[]::uuid[]);
END;
$fn$;

-- The org ids where the caller is an active attorney with general counsel.
CREATE OR REPLACE FUNCTION public.auth_counsel_org_ids()
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth_counsel_org_ids: sign in first' USING errcode = '42501';
  END IF;
  RETURN COALESCE(ARRAY(
    SELECT m.org_id FROM public.org_members m
      JOIN public.orgs o ON o.id = m.org_id AND o.suspended_at IS NULL AND o.archived_at IS NULL
     WHERE m.user_id = auth.uid()
       AND m.role = 'attorney'
       AND m.general_counsel
       AND m.access_expires_at IS NOT NULL
       AND m.access_expires_at > now()
  ), ARRAY[]::uuid[]);
END;
$fn$;

-- Owner names for the receivables view (a CPA needs who owes, not how to
-- reach them): unit id and current owner name only.
CREATE OR REPLACE FUNCTION public.cpa_owner_names(p_org_id uuid)
RETURNS TABLE (unit_id uuid, owner_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'cpa_owner_names: sign in first' USING errcode = '42501';
  END IF;
  IF NOT public.auth_pro_active(p_org_id, 'cpa') THEN
    RAISE EXCEPTION 'cpa_owner_names: not authorized' USING errcode = '42501';
  END IF;
  RETURN QUERY
  SELECT o.unit_id, o.owner_name
    FROM public.ownerships o
   WHERE o.organization_id = p_org_id AND o.valid_to IS NULL;
END;
$fn$;

-- The owner name and the home's address for ONE assigned matter (letters
-- need them). Nothing else of the owner leaves: no email, no phone. The
-- home is the one the assignment resolved to.
CREATE OR REPLACE FUNCTION public.attorney_matter_party(p_org_id uuid, p_matter_type text, p_matter_id uuid)
RETURNS TABLE (owner_name text, address_line1 text, address_line2 text, city text, state text, postal_code text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'attorney_matter_party: sign in first' USING errcode = '42501';
  END IF;
  IF NOT public.auth_attorney_has_matter(p_org_id, p_matter_type, p_matter_id) THEN
    RAISE EXCEPTION 'attorney_matter_party: not authorized' USING errcode = '42501';
  END IF;
  RETURN QUERY
  SELECT (SELECT o.owner_name FROM public.ownerships o
           WHERE o.unit_id = u.id AND o.valid_to IS NULL
           ORDER BY o.valid_from DESC, o.id LIMIT 1),
         u.address_line1, u.address_line2, u.city, u.state, u.postal_code
    FROM public.matter_assignments a
    JOIN public.units u ON u.id = a.unit_id AND u.organization_id = a.organization_id
   WHERE a.organization_id = p_org_id
     AND a.user_id = auth.uid()
     AND a.matter_type = p_matter_type
     AND a.matter_id = p_matter_id
     AND a.revoked_at IS NULL
   LIMIT 1;
END;
$fn$;

DO $grants$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.auth_pro_active(uuid, text)',
    'public.auth_has_pro_membership(uuid)',
    'public.auth_attorney_has_matter(uuid, text, uuid)',
    'public.auth_attorney_matter_ids(text)',
    'public.auth_attorney_unit_ids()',
    'public.auth_pro_org_ids(text)',
    'public.auth_counsel_org_ids()',
    'public.cpa_owner_names(uuid)',
    'public.attorney_matter_party(uuid, text, uuid)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END
$grants$;

ALTER TABLE public.matter_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS matter_assignments_select ON public.matter_assignments;
DROP POLICY IF EXISTS matter_assignments_select_own ON public.matter_assignments;
DROP POLICY IF EXISTS matter_assignments_insert ON public.matter_assignments;
DROP POLICY IF EXISTS matter_assignments_update ON public.matter_assignments;
DROP POLICY IF EXISTS matter_assignments_delete ON public.matter_assignments;

CREATE POLICY matter_assignments_select ON public.matter_assignments
  FOR SELECT TO authenticated
  USING (public.auth_is_board_or_admin(organization_id));
CREATE POLICY matter_assignments_select_own ON public.matter_assignments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()
         AND revoked_at IS NULL
         AND public.auth_pro_active(organization_id, 'attorney'));
CREATE POLICY matter_assignments_insert ON public.matter_assignments
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_is_board_or_admin(organization_id));
CREATE POLICY matter_assignments_update ON public.matter_assignments
  FOR UPDATE TO authenticated
  USING (public.auth_is_board_or_admin(organization_id))
  WITH CHECK (public.auth_is_board_or_admin(organization_id));
CREATE POLICY matter_assignments_delete ON public.matter_assignments
  FOR DELETE TO authenticated
  USING (public.auth_is_board_or_admin(organization_id));

-- ── 4. approvals: proposer, sign-offs, dual control ───────────────────
ALTER TABLE public.approval_requests
  ADD COLUMN IF NOT EXISTS proposed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS approval_requests_proposed_by_idx
  ON public.approval_requests (proposed_by)
  WHERE proposed_by IS NOT NULL;

-- A professional reads their own proposals (status, decision reason) and
-- nobody else's. Inserts stay service-role only (0060): the app proposes
-- on their behalf after its own gate.
DROP POLICY IF EXISTS approval_requests_select_proposer ON public.approval_requests;
CREATE POLICY approval_requests_select_proposer ON public.approval_requests
  FOR SELECT TO authenticated
  USING (proposed_by = auth.uid()
         AND public.auth_pro_active(organization_id));

-- Collections letters of an assigned case, for the attorney drafting the
-- next one. The payload's caseId is shape-checked before the cast. The
-- id list is cast to uuid[] so the subquery is ONE array value (an
-- initPlan, as 0061 does), not a set of rows.
DROP POLICY IF EXISTS approval_requests_select_attorney_letters ON public.approval_requests;
CREATE POLICY approval_requests_select_attorney_letters ON public.approval_requests
  FOR SELECT TO authenticated
  USING (action_type = 'collections.letter'
         AND CASE
               WHEN (payload ->> 'caseId') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               THEN (payload ->> 'caseId')::uuid = ANY ((SELECT public.auth_attorney_matter_ids('collections_case'))::uuid[])
               ELSE false
             END);

-- Money action types: every approval_requests action that moves money.
-- Keep in step with MONEY_ACTIONS in apps/hoa/src/lib/professionals/model.ts
-- (a unit test reads this function and compares). Refunds, vendor payments
-- and late-fee policy changes are not approval-layer actions yet; add them
-- here and in MONEY_ACTIONS when they become one.
CREATE OR REPLACE FUNCTION public.approval_is_money_action(p_action text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT p_action IN ('w18.cash_receipt', 'w36.ap_bill', 'accounting.opening_balances', 'pro.journal_entry')
$fn$;

ALTER TABLE public.associations
  ADD COLUMN IF NOT EXISTS dual_control_cents bigint
  CHECK (dual_control_cents IS NULL OR dual_control_cents > 0);

COMMENT ON COLUMN public.associations.dual_control_cents IS
  'BL-168: a money approval above this amount (cents) needs sign-off from two different board/admin members. Null = no dual control. Admin-set (trigger), audited.';

-- Only an admin changes the amount (board UPDATE on associations would
-- otherwise let any board member clear it through PostgREST), and every
-- change leaves an audit row. SECURITY INVOKER on purpose: current_user is
-- the PostgREST role. The service role passes (it has no auth.uid()).
CREATE OR REPLACE FUNCTION public.associations_dual_control_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF tg_op = 'UPDATE' THEN
    -- An association never moves to another organization through PostgREST
    -- (it would carry its amount, or lack of one, into the other org).
    IF current_user = 'authenticated' AND new.organization_id IS DISTINCT FROM old.organization_id THEN
      RAISE EXCEPTION 'associations: an association cannot be moved to another organization'
        USING errcode = '42501';
    END IF;
    IF new.dual_control_cents IS NOT DISTINCT FROM old.dual_control_cents THEN
      RETURN new;
    END IF;
  ELSIF new.dual_control_cents IS NULL THEN
    RETURN new;
  END IF;
  IF current_user = 'authenticated'
     AND (auth.uid() IS NULL OR NOT public.auth_is_admin(new.organization_id)) THEN
    RAISE EXCEPTION 'associations: only an admin changes the dual-control amount'
      USING errcode = '42501';
  END IF;
  IF tg_op = 'UPDATE' THEN
    INSERT INTO public.audit_log (org_id, user_id, action, entity_type, entity_id, metadata)
    VALUES (new.organization_id, auth.uid(), 'dual_control.set', 'association', new.id,
            jsonb_build_object('old_cents', old.dual_control_cents, 'new_cents', new.dual_control_cents));
  ELSE
    INSERT INTO public.audit_log (org_id, user_id, action, entity_type, entity_id, metadata)
    VALUES (new.organization_id, auth.uid(), 'dual_control.set', 'association', new.id,
            jsonb_build_object('old_cents', NULL, 'new_cents', new.dual_control_cents));
  END IF;
  RETURN new;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.associations_dual_control_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS associations_dual_control_guard ON public.associations;
CREATE TRIGGER associations_dual_control_guard
  BEFORE INSERT OR UPDATE OF dual_control_cents, organization_id ON public.associations
  FOR EACH ROW EXECUTE FUNCTION public.associations_dual_control_guard();

CREATE TABLE IF NOT EXISTS public.approval_signoffs (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid        NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  approval_request_id  uuid        NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  signer_id            uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  signer_title         text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT approval_signoffs_once UNIQUE (approval_request_id, signer_id)
);

CREATE INDEX IF NOT EXISTS approval_signoffs_org_idx
  ON public.approval_signoffs (organization_id);

COMMENT ON TABLE public.approval_signoffs IS
  'BL-168: who has signed off a pending approval request. Board/admin read; written only by record_approval_signoff(); cleared when the request''s payload or amount changes.';

ALTER TABLE public.approval_signoffs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS approval_signoffs_select ON public.approval_signoffs;
CREATE POLICY approval_signoffs_select ON public.approval_signoffs
  FOR SELECT TO authenticated
  USING (public.auth_is_board_or_admin(organization_id));
-- No write policy: the function below is the only user-reachable write.
-- A sign-off belongs to a request of its own org (tenant_fk_same_org, 0070).
DROP TRIGGER IF EXISTS approval_signoffs_approval_request_id_org_scope ON public.approval_signoffs;
CREATE TRIGGER approval_signoffs_approval_request_id_org_scope
  BEFORE INSERT OR UPDATE OF approval_request_id, organization_id ON public.approval_signoffs
  FOR EACH ROW EXECUTE FUNCTION public.tenant_fk_same_org('approval_request_id', 'approval_requests', 'organization_id', 'organization_id');

CREATE OR REPLACE FUNCTION public.record_approval_signoff(p_request_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.approval_requests%ROWTYPE;
  v_title text;
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'record_approval_signoff: sign in first' USING errcode = '42501';
  END IF;
  SELECT * INTO v_row FROM public.approval_requests WHERE id = p_request_id;
  -- Missing, another org's, or not board/admin: one indistinct error.
  IF NOT FOUND OR NOT public.auth_is_board_or_admin(v_row.organization_id) THEN
    RAISE EXCEPTION 'record_approval_signoff: not authorized' USING errcode = '42501';
  END IF;
  IF v_row.status <> 'proposed' THEN
    RAISE EXCEPTION 'record_approval_signoff: the request is already decided' USING errcode = '22023';
  END IF;
  -- Whoever proposed an item cannot be one of its two signatures.
  IF v_row.proposed_by IS NOT NULL AND v_row.proposed_by = v_uid THEN
    RAISE EXCEPTION 'record_approval_signoff: the proposer cannot sign off their own item' USING errcode = '42501';
  END IF;
  SELECT m.officer_title INTO v_title
    FROM public.org_members m
   WHERE m.org_id = v_row.organization_id AND m.user_id = v_uid;
  INSERT INTO public.approval_signoffs (organization_id, approval_request_id, signer_id, signer_title)
  VALUES (v_row.organization_id, p_request_id, v_uid, v_title)
  ON CONFLICT (approval_request_id, signer_id) DO NOTHING;
  SELECT count(*) INTO v_count FROM public.approval_signoffs WHERE approval_request_id = p_request_id;
  RETURN v_count;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.record_approval_signoff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_approval_signoff(uuid) TO authenticated, service_role;

-- A money item is born 'proposed': nothing inserts one already approved or
-- posted and so skips the sign-offs (also for the service role).
CREATE OR REPLACE FUNCTION public.approval_requests_money_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF public.approval_is_money_action(new.action_type) AND new.status <> 'proposed' THEN
    RAISE EXCEPTION 'approval_requests: a money item must be inserted as proposed'
      USING errcode = '23514';
  END IF;
  RETURN new;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.approval_requests_money_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS approval_requests_money_insert ON public.approval_requests;
CREATE TRIGGER approval_requests_money_insert
  BEFORE INSERT ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.approval_requests_money_insert();

-- Sign-offs belong to the item as it was when they were given: editing the
-- payload or the amount clears them. Named with a leading 0 so it fires
-- BEFORE approval_requests_dual_control (triggers fire in name order) when
-- one UPDATE changes both. A trigger function cannot refuse a null
-- auth.uid() (the service role has none); nobody can call it directly.
CREATE OR REPLACE FUNCTION public.approval_requests_reset_signoffs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF new.payload IS DISTINCT FROM old.payload OR new.amount IS DISTINCT FROM old.amount THEN
    DELETE FROM public.approval_signoffs WHERE approval_request_id = new.id;
  END IF;
  RETURN new;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.approval_requests_reset_signoffs() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS approval_requests_0_reset_signoffs ON public.approval_requests;
CREATE TRIGGER approval_requests_0_reset_signoffs
  BEFORE UPDATE OF payload, amount ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.approval_requests_reset_signoffs();

-- An approval request never changes what it is or whose it is: action_type
-- and organization_id are fixed at insert, whoever updates the row. (Else a
-- non-money row could be re-labelled after it was approved, or a money row
-- relabelled to dodge the dual-control and money-insert rules.)
CREATE OR REPLACE FUNCTION public.approval_requests_immutable_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF new.action_type IS DISTINCT FROM old.action_type OR new.organization_id IS DISTINCT FROM old.organization_id THEN
    RAISE EXCEPTION 'approval_requests: action_type and organization_id cannot be changed'
      USING errcode = '23514';
  END IF;
  RETURN new;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.approval_requests_immutable_identity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS approval_requests_00_immutable_identity ON public.approval_requests;
CREATE TRIGGER approval_requests_00_immutable_identity
  BEFORE UPDATE OF action_type, organization_id ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.approval_requests_immutable_identity();

-- Dual control: a money item above the association's amount (or with no
-- amount at all, once an amount is set) is not approved on one signature,
-- whoever calls decide_approval_request or updates the row. Only signers
-- who are CURRENTLY admin or board of the org count, and never the
-- proposer. SECURITY INVOKER: it reads as the decider (board/admin) or the
-- service role.
CREATE OR REPLACE FUNCTION public.approval_requests_dual_control()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_threshold bigint;
  v_signers integer;
BEGIN
  -- An item from a CPA or attorney is approvable only while that person's
  -- grant is active. A grant that has ended leaves the item waiting; renew
  -- the grant (their matter assignments come back with it) or reject it.
  IF new.status IN ('approved', 'posted') AND old.status NOT IN ('approved', 'posted')
     AND new.action_type LIKE 'pro.%' AND new.proposed_by IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.org_members m
                    WHERE m.org_id = new.organization_id
                      AND m.user_id = new.proposed_by
                      AND m.role IN ('cpa', 'attorney')
                      AND m.access_expires_at IS NOT NULL
                      AND m.access_expires_at > now()) THEN
      RAISE EXCEPTION 'approval_requests: the professional''s access has ended; renew it or reject this item'
        USING errcode = '23514';
    END IF;
  END IF;
  IF new.status IN ('approved', 'posted') AND old.status NOT IN ('approved', 'posted')
     AND public.approval_is_money_action(new.action_type) THEN
    SELECT min(a.dual_control_cents) INTO v_threshold
      FROM public.associations a
     WHERE a.organization_id = new.organization_id
       AND a.dual_control_cents IS NOT NULL;
    IF v_threshold IS NOT NULL AND (new.amount IS NULL OR (new.amount * 100) > v_threshold) THEN
      SELECT count(DISTINCT s.signer_id) INTO v_signers
        FROM public.approval_signoffs s
        JOIN public.org_members m
          ON m.org_id = new.organization_id
         AND m.user_id = s.signer_id
         AND m.role IN ('admin', 'board')
       WHERE s.approval_request_id = new.id
         AND s.signer_id IS DISTINCT FROM new.proposed_by;
      IF v_signers < 2 THEN
        RAISE EXCEPTION 'approval_requests: this amount needs sign-off from two board members'
          USING errcode = '23514';
      END IF;
    END IF;
  END IF;
  RETURN new;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.approval_requests_dual_control() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS approval_requests_dual_control ON public.approval_requests;
CREATE TRIGGER approval_requests_dual_control
  BEFORE UPDATE OF status ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.approval_requests_dual_control();

-- ── 5. read policies for professionals ────────────────────────────────
DO $mig$
DECLARE
  t text;
  cpa_tables text[] := ARRAY[
    'funds', 'chart_of_accounts', 'fiscal_periods', 'journal_entries',
    'ledger_entries', 'budgets', 'bank_accounts', 'bank_transactions',
    'bank_reconciliations', 'assessments', 'payments', 'invoices',
    'payment_plans', 'recurring_journal_entries'
  ];
BEGIN
  FOREACH t IN ARRAY cpa_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_cpa_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
         USING (organization_id = ANY ((SELECT public.auth_pro_org_ids(''cpa''))::uuid[]))', t || '_cpa_select', t);
  END LOOP;

  -- Child tables: through the parent's org.
  DROP POLICY IF EXISTS budget_line_items_cpa_select ON public.budget_line_items;
  CREATE POLICY budget_line_items_cpa_select ON public.budget_line_items FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.budgets b
                    WHERE b.id = budget_line_items.budget_id
                      AND b.organization_id = ANY ((SELECT public.auth_pro_org_ids('cpa'))::uuid[])));
  DROP POLICY IF EXISTS adjusting_entries_cpa_select ON public.adjusting_entries;
  CREATE POLICY adjusting_entries_cpa_select ON public.adjusting_entries FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.journal_entries je
                    WHERE je.id = adjusting_entries.journal_entry_id
                      AND je.organization_id = ANY ((SELECT public.auth_pro_org_ids('cpa'))::uuid[])));
  DROP POLICY IF EXISTS closing_entries_cpa_select ON public.closing_entries;
  CREATE POLICY closing_entries_cpa_select ON public.closing_entries FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.journal_entries je
                    WHERE je.id = closing_entries.journal_entry_id
                      AND je.organization_id = ANY ((SELECT public.auth_pro_org_ids('cpa'))::uuid[])));

  -- Attorney: the assigned matters.
  DROP POLICY IF EXISTS collection_cases_attorney_select ON public.collection_cases;
  CREATE POLICY collection_cases_attorney_select ON public.collection_cases FOR SELECT TO authenticated
    USING (id = ANY ((SELECT public.auth_attorney_matter_ids('collections_case'))::uuid[]));
  DROP POLICY IF EXISTS collection_events_attorney_select ON public.collection_events;
  CREATE POLICY collection_events_attorney_select ON public.collection_events FOR SELECT TO authenticated
    USING (collection_case_id = ANY ((SELECT public.auth_attorney_matter_ids('collections_case'))::uuid[]));
  DROP POLICY IF EXISTS hoa_violations_attorney_select ON public.hoa_violations;
  CREATE POLICY hoa_violations_attorney_select ON public.hoa_violations FOR SELECT TO authenticated
    USING (id = ANY ((SELECT public.auth_attorney_matter_ids('violation'))::uuid[]));
  DROP POLICY IF EXISTS violation_hearings_attorney_select ON public.violation_hearings;
  CREATE POLICY violation_hearings_attorney_select ON public.violation_hearings FOR SELECT TO authenticated
    USING (violation_id = ANY ((SELECT public.auth_attorney_matter_ids('violation'))::uuid[]));
  DROP POLICY IF EXISTS tickets_attorney_select ON public.tickets;
  CREATE POLICY tickets_attorney_select ON public.tickets FOR SELECT TO authenticated
    USING (category = 'records_request'
           AND id = ANY ((SELECT public.auth_attorney_matter_ids('records_request'))::uuid[]));

  -- The unit ledger of an assigned unit.
  DROP POLICY IF EXISTS assessments_attorney_select ON public.assessments;
  CREATE POLICY assessments_attorney_select ON public.assessments FOR SELECT TO authenticated
    USING (unit_id = ANY ((SELECT public.auth_attorney_unit_ids())::uuid[]));
  DROP POLICY IF EXISTS payments_attorney_select ON public.payments;
  CREATE POLICY payments_attorney_select ON public.payments FOR SELECT TO authenticated
    USING (unit_id = ANY ((SELECT public.auth_attorney_unit_ids())::uuid[]));

  -- General counsel.
  DROP POLICY IF EXISTS governing_documents_counsel_select ON public.governing_documents;
  CREATE POLICY governing_documents_counsel_select ON public.governing_documents FOR SELECT TO authenticated
    USING (organization_id = ANY ((SELECT public.auth_counsel_org_ids())::uuid[]));
  DROP POLICY IF EXISTS compliance_deadlines_done_counsel_select ON public.compliance_deadlines_done;
  CREATE POLICY compliance_deadlines_done_counsel_select ON public.compliance_deadlines_done FOR SELECT TO authenticated
    USING (organization_id = ANY ((SELECT public.auth_counsel_org_ids())::uuid[]));

  -- orgs and associations are NOT readable by a professional (every column,
  -- compliance_settings and the Stripe ids included): pro_org_info() below.
  DROP POLICY IF EXISTS orgs_pro_select ON public.orgs;
  DROP POLICY IF EXISTS associations_pro_select ON public.associations;
END
$mig$;

-- ── 5b. what a professional may know about the org ────────────────────
-- Instead of a read policy on orgs and associations (every column,
-- including compliance_settings and the Stripe ids), one function returns
-- the names. An expired grant gets the org's name only.
CREATE OR REPLACE FUNCTION public.pro_org_info(p_org_id uuid)
RETURNS TABLE (org_name text, association_name text, association_state text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'pro_org_info: sign in first' USING errcode = '42501';
  END IF;
  IF public.auth_pro_active(p_org_id) THEN
    RETURN QUERY
    SELECT o.name, a.name, a.state
      FROM public.orgs o
      LEFT JOIN public.associations a ON a.organization_id = o.id
     WHERE o.id = p_org_id
     ORDER BY a.name
     LIMIT 1;
  ELSIF public.auth_has_pro_membership(p_org_id) THEN
    RETURN QUERY SELECT o.name, NULL::text, NULL::text FROM public.orgs o WHERE o.id = p_org_id;
  ELSE
    RAISE EXCEPTION 'pro_org_info: not authorized' USING errcode = '42501';
  END IF;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.pro_org_info(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pro_org_info(uuid) TO authenticated, service_role;

-- ── 6. guarding the grant itself ──────────────────────────────────────
-- (a) A grant ends within a year (367 days leaves room for end-of-day
-- rounding and clock skew), also for the service role; a membership never
-- moves to another person or organization through PostgREST.
-- SECURITY INVOKER on purpose: current_user is the PostgREST role.
CREATE OR REPLACE FUNCTION public.org_members_pro_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF tg_op = 'UPDATE' THEN
    -- Leaving the board ends the office.
    IF old.role = 'board' AND new.role <> 'board' THEN
      new.officer_title := NULL;
    END IF;
    IF current_user = 'authenticated'
       AND (new.org_id IS DISTINCT FROM old.org_id OR new.user_id IS DISTINCT FROM old.user_id) THEN
      RAISE EXCEPTION 'org_members: a membership cannot be moved to another person or organization'
        USING errcode = '42501';
    END IF;
  END IF;
  -- A cpa/attorney row is created (or a member upgraded to one) only by the
  -- service role: the invitation flow, which requires the person's own
  -- consent. A board member or admin on PostgREST can renew, change or
  -- remove one, never make one.
  IF new.role IN ('cpa', 'attorney') AND current_user = 'authenticated' THEN
    IF tg_op = 'INSERT' THEN
      RAISE EXCEPTION 'org_members: a professional joins by accepting an invitation'
        USING errcode = '42501';
    ELSIF old.role NOT IN ('cpa', 'attorney') THEN
      RAISE EXCEPTION 'org_members: a professional joins by accepting an invitation'
        USING errcode = '42501';
    END IF;
  END IF;
  IF new.role IN ('cpa', 'attorney') AND new.access_expires_at > now() + interval '367 days' THEN
    -- Only a new or changed grant is checked; a row already on file is left alone.
    IF tg_op = 'INSERT' THEN
      RAISE EXCEPTION 'org_members: professional access can run for at most a year at a time'
        USING errcode = '23514';
    ELSIF new.access_expires_at IS DISTINCT FROM old.access_expires_at OR new.role IS DISTINCT FROM old.role THEN
      RAISE EXCEPTION 'org_members: professional access can run for at most a year at a time'
        USING errcode = '23514';
    END IF;
  END IF;
  RETURN new;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.org_members_pro_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS org_members_pro_guard ON public.org_members;
CREATE TRIGGER org_members_pro_guard
  BEFORE INSERT OR UPDATE ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.org_members_pro_guard();

-- (b) Every grant, change and removal of a cpa/attorney row is audited
-- (ids, role and dates only), whoever made it. A failed audit write never
-- blocks the change (an org being deleted cascades through here).
CREATE OR REPLACE FUNCTION public.org_members_pro_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  r public.org_members%ROWTYPE;
BEGIN
  IF tg_op = 'DELETE' THEN
    r := old;
  ELSE
    r := new;
  END IF;
  IF r.role NOT IN ('cpa', 'attorney') THEN
    -- An UPDATE that ends a professional's role is audited too.
    IF tg_op <> 'UPDATE' THEN
      RETURN NULL;
    ELSIF old.role NOT IN ('cpa', 'attorney') THEN
      RETURN NULL;
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE id = r.org_id) THEN
    RETURN NULL;
  END IF;
  BEGIN
    INSERT INTO public.audit_log (org_id, user_id, action, entity_type, entity_id, metadata)
    VALUES (r.org_id, auth.uid(),
            CASE tg_op WHEN 'INSERT' THEN 'pro.member_added' WHEN 'DELETE' THEN 'pro.member_removed' ELSE 'pro.member_changed' END,
            'org_member', r.user_id,
            jsonb_build_object('role', r.role, 'expires_at', r.access_expires_at, 'general_counsel', r.general_counsel));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.org_members_pro_audit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS org_members_pro_audit ON public.org_members;
CREATE TRIGGER org_members_pro_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.org_members_pro_audit();

-- (c) When a professional is removed (or stops being one), their matter
-- assignments end and their pending proposals are rejected, so nothing
-- they sent can still be approved by accident and a later re-invite
-- starts clean.
CREATE OR REPLACE FUNCTION public.org_members_pro_revoke()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF old.role NOT IN ('cpa', 'attorney') THEN
    RETURN NULL;
  END IF;
  IF tg_op = 'UPDATE' THEN
    IF new.role = old.role THEN
      RETURN NULL;
    END IF;
  END IF;
  UPDATE public.matter_assignments
     SET revoked_at = now()
   WHERE organization_id = old.org_id AND user_id = old.user_id AND revoked_at IS NULL;
  UPDATE public.approval_requests
     SET status = 'rejected', decided_at = now(), decision_reason = 'Access was removed'
   WHERE organization_id = old.org_id
     AND proposed_by = old.user_id
     AND status = 'proposed'
     AND action_type LIKE 'pro.%';
  RETURN NULL;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.org_members_pro_revoke() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS org_members_pro_revoke ON public.org_members;
CREATE TRIGGER org_members_pro_revoke
  AFTER DELETE OR UPDATE OF role ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.org_members_pro_revoke();

-- (d) Invitations for people who already have a HomeownerHub account. The
-- board records the invitation; it grants NOTHING. The person opens a
-- signed link while signed in as that email and accepts, and only then is
-- the org_members row (and any matter assignment) created, by the app with
-- the service role. Single use, expiring, revocable.
CREATE TABLE IF NOT EXISTS public.professional_invites (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  email            text        NOT NULL CHECK (email = lower(email) AND length(email) <= 254),
  role             text        NOT NULL CHECK (role IN ('cpa', 'attorney')),
  access_expires_on date       NOT NULL,
  general_counsel  boolean     NOT NULL DEFAULT false CHECK (NOT general_counsel OR role = 'attorney'),
  matters          jsonb       NOT NULL DEFAULT '[]'::jsonb
                               CHECK (jsonb_typeof(matters) = 'array' AND jsonb_array_length(matters) <= 50),
  created_by       uuid        REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  link_expires_at  timestamptz NOT NULL DEFAULT now() + interval '7 days',
  accepted_at      timestamptz,
  accepted_by      uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  revoked_at       timestamptz,
  -- A grant requested today ends within a year (366 days leaves room for the
  -- association's time zone against UTC).
  CONSTRAINT professional_invites_window CHECK (access_expires_on <= ((created_at AT TIME ZONE 'UTC')::date + 366))
);

CREATE UNIQUE INDEX IF NOT EXISTS professional_invites_live_uniq
  ON public.professional_invites (organization_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

COMMENT ON TABLE public.professional_invites IS
  'BL-168: a pending invitation for a CPA or attorney who already has an account. Grants nothing until accepted through the signed link. Board/admin read and write; acceptance is service-role only.';

CREATE OR REPLACE FUNCTION public.professional_invites_attribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF tg_op = 'INSERT' THEN
    -- Whatever the caller sends, a new invitation starts now, lives seven
    -- days, and is neither accepted nor revoked.
    new.created_at := now();
    new.link_expires_at := now() + interval '7 days';
    new.revoked_at := NULL;
    IF current_user = 'authenticated' THEN
      new.created_by := auth.uid();
      new.accepted_at := NULL;
      new.accepted_by := NULL;
    END IF;
  ELSIF current_user = 'authenticated' THEN
    -- The board may revoke (NULL -> a time, once); it cannot accept on
    -- anyone's behalf, un-revoke, extend the link, or edit the grant.
    IF old.revoked_at IS NOT NULL THEN
      new.revoked_at := old.revoked_at;
    ELSIF new.revoked_at IS NOT NULL THEN
      new.revoked_at := now();
    END IF;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.accepted_at := old.accepted_at;
    new.accepted_by := old.accepted_by;
    new.email := old.email;
    new.role := old.role;
    new.access_expires_on := old.access_expires_on;
    new.general_counsel := old.general_counsel;
    new.matters := old.matters;
    new.link_expires_at := old.link_expires_at;
    new.organization_id := old.organization_id;
  END IF;
  RETURN new;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.professional_invites_attribution() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS professional_invites_attribution ON public.professional_invites;
CREATE TRIGGER professional_invites_attribution
  BEFORE INSERT OR UPDATE ON public.professional_invites
  FOR EACH ROW EXECUTE FUNCTION public.professional_invites_attribution();

ALTER TABLE public.professional_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS professional_invites_select ON public.professional_invites;
DROP POLICY IF EXISTS professional_invites_insert ON public.professional_invites;
DROP POLICY IF EXISTS professional_invites_update ON public.professional_invites;
CREATE POLICY professional_invites_select ON public.professional_invites
  FOR SELECT TO authenticated
  USING (public.auth_is_board_or_admin(organization_id));
CREATE POLICY professional_invites_insert ON public.professional_invites
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_is_board_or_admin(organization_id));
CREATE POLICY professional_invites_update ON public.professional_invites
  FOR UPDATE TO authenticated
  USING (public.auth_is_board_or_admin(organization_id))
  WITH CHECK (public.auth_is_board_or_admin(organization_id));

COMMIT;
