-- 0070_m6_roles.sql — migration batch M6 (BL-168 professional and officer
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
  IF to_regclass('public.org_members') IS NULL THEN
    RAISE EXCEPTION '0070: org_members is missing';
  END IF;
  IF to_regprocedure('public.auth_is_board_or_admin(uuid)') IS NULL THEN
    RAISE EXCEPTION '0070: auth_is_board_or_admin(uuid) is missing (0012)';
  END IF;
  IF to_regprocedure('public.auth_is_admin(uuid)') IS NULL THEN
    RAISE EXCEPTION '0070: auth_is_admin(uuid) is missing (0012)';
  END IF;
  IF to_regprocedure('public.auth_org_ids()') IS NULL THEN
    RAISE EXCEPTION '0070: auth_org_ids() is missing (0000)';
  END IF;
  IF to_regclass('public.approval_requests') IS NULL THEN
    RAISE EXCEPTION '0070: approval_requests is missing (0060)';
  END IF;
  IF to_regclass('public.journal_entries') IS NULL OR to_regclass('public.assessments') IS NULL
     OR to_regclass('public.adjusting_entries') IS NULL OR to_regclass('public.budget_line_items') IS NULL THEN
    RAISE EXCEPTION '0070: the accounting tables are missing (0006, 0061)';
  END IF;
  IF to_regclass('public.collection_cases') IS NULL OR to_regclass('public.collection_events') IS NULL THEN
    RAISE EXCEPTION '0070: collection_cases / collection_events are missing (0047)';
  END IF;
  IF to_regclass('public.violation_hearings') IS NULL THEN
    RAISE EXCEPTION '0070: violation_hearings is missing (0068)';
  END IF;
  IF to_regclass('public.hoa_violations') IS NULL OR to_regclass('public.tickets') IS NULL THEN
    RAISE EXCEPTION '0070: hoa_violations / tickets are missing';
  END IF;
  IF to_regclass('public.units') IS NULL OR to_regclass('public.ownerships') IS NULL THEN
    RAISE EXCEPTION '0070: units / ownerships are missing (0004)';
  END IF;
  IF to_regclass('public.governing_documents') IS NULL THEN
    RAISE EXCEPTION '0070: governing_documents is missing (0004)';
  END IF;
  IF to_regclass('public.compliance_deadlines_done') IS NULL THEN
    RAISE EXCEPTION '0070: compliance_deadlines_done is missing (0067)';
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
-- Same signature and shape as 0000 (SQL, STABLE, SECURITY DEFINER; no
-- session gives an empty list, never an error: policies on tables the
-- anon role can reach call it). Only the role filter is new.
CREATE OR REPLACE FUNCTION public.auth_org_ids() RETURNS uuid[]
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT COALESCE(
    ARRAY(SELECT org_id FROM org_members
           WHERE user_id = auth.uid()
             AND role IN ('admin', 'board', 'resident')),
    '{}'::UUID[]
  )
$$;

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
-- attorney member of THIS org and the matter is this org's.
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
  IF new.matter_type = 'collections_case' AND NOT EXISTS (
       SELECT 1 FROM public.collection_cases c
        WHERE c.id = new.matter_id AND c.organization_id = new.organization_id) THEN
    RAISE EXCEPTION 'matter_assignments: the collections case is not in this organization'
      USING errcode = '23503';
  ELSIF new.matter_type = 'violation' AND NOT EXISTS (
       SELECT 1 FROM public.hoa_violations v
        WHERE v.id = new.matter_id AND v.org_id = new.organization_id) THEN
    RAISE EXCEPTION 'matter_assignments: the violation is not in this organization'
      USING errcode = '23503';
  ELSIF new.matter_type = 'records_request' AND NOT EXISTS (
       SELECT 1 FROM public.tickets t
        WHERE t.id = new.matter_id AND t.organization_id = new.organization_id
          AND t.category = 'records_request') THEN
    RAISE EXCEPTION 'matter_assignments: the records request is not in this organization'
      USING errcode = '23503';
  END IF;
  RETURN new;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.matter_assignments_scope() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS matter_assignments_scope ON public.matter_assignments;
CREATE TRIGGER matter_assignments_scope
  BEFORE INSERT OR UPDATE OF organization_id, user_id, matter_type, matter_id ON public.matter_assignments
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
     WHERE a.user_id = auth.uid()
       AND a.matter_type = p_matter_type
       AND a.revoked_at IS NULL
       AND m.role = 'attorney'
       AND m.access_expires_at IS NOT NULL
       AND m.access_expires_at > now()
  ), ARRAY[]::uuid[]);
END;
$fn$;

-- The units behind the caller's live assignments (a collections case's
-- unit, a violation's unit through the property bridge, a records
-- request's unit), across the orgs where the grant is active. Ids only.
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
    SELECT c.unit_id
      FROM public.collection_cases c
     WHERE c.id = ANY (public.auth_attorney_matter_ids('collections_case'))
    UNION
    SELECT u.id
      FROM public.hoa_violations v
      JOIN public.units u ON u.legacy_hoa_property_id = v.property_id AND u.organization_id = v.org_id
     WHERE v.id = ANY (public.auth_attorney_matter_ids('violation'))
    UNION
    SELECT t.unit_id
      FROM public.tickets t
     WHERE t.id = ANY (public.auth_attorney_matter_ids('records_request'))
       AND t.unit_id IS NOT NULL
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
-- need them). Nothing else of the owner leaves: no email, no phone.
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
           ORDER BY o.valid_from DESC LIMIT 1),
         u.address_line1, u.address_line2, u.city, u.state, u.postal_code
    FROM public.units u
   WHERE u.organization_id = p_org_id
     AND u.id = ANY (public.auth_attorney_unit_ids())
     AND u.id = (
       CASE p_matter_type
         WHEN 'collections_case' THEN (SELECT c.unit_id FROM public.collection_cases c WHERE c.id = p_matter_id)
         WHEN 'violation' THEN (SELECT x.id FROM public.hoa_violations v
                                  JOIN public.units x ON x.legacy_hoa_property_id = v.property_id
                                 WHERE v.id = p_matter_id LIMIT 1)
         ELSE (SELECT t.unit_id FROM public.tickets t WHERE t.id = p_matter_id)
       END)
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
-- next one. The payload's caseId is shape-checked before the cast.
DROP POLICY IF EXISTS approval_requests_select_attorney_letters ON public.approval_requests;
CREATE POLICY approval_requests_select_attorney_letters ON public.approval_requests
  FOR SELECT TO authenticated
  USING (action_type = 'collections.letter'
         AND CASE
               WHEN (payload ->> 'caseId') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               THEN (payload ->> 'caseId')::uuid = ANY ((SELECT public.auth_attorney_matter_ids('collections_case')))
               ELSE false
             END);

ALTER TABLE public.associations
  ADD COLUMN IF NOT EXISTS dual_control_cents bigint
  CHECK (dual_control_cents IS NULL OR dual_control_cents > 0);

COMMENT ON COLUMN public.associations.dual_control_cents IS
  'BL-168: a money approval above this amount (cents) needs sign-off from two different board/admin members. Null = no dual control.';

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
  'BL-168: who has signed off a pending approval request. Board/admin read; written only by record_approval_signoff().';

ALTER TABLE public.approval_signoffs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS approval_signoffs_select ON public.approval_signoffs;
CREATE POLICY approval_signoffs_select ON public.approval_signoffs
  FOR SELECT TO authenticated
  USING (public.auth_is_board_or_admin(organization_id));
-- No write policy: the function below is the only user-reachable write.

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

-- Dual control: a money item above the association's amount is not
-- approved on one signature, whoever calls decide_approval_request. Money
-- action types (keep in step with MONEY_ACTIONS in
-- apps/hoa/src/lib/professionals/model.ts): 'w36.ap_bill', 'pro.journal_entry'.
-- SECURITY INVOKER: reads approval_signoffs and associations as the
-- decider (board/admin) or the service role; no definer needed.
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
  IF new.status = 'approved' AND old.status = 'proposed'
     AND new.action_type IN ('w36.ap_bill', 'pro.journal_entry')
     AND new.amount IS NOT NULL THEN
    SELECT min(a.dual_control_cents) INTO v_threshold
      FROM public.associations a
     WHERE a.organization_id = new.organization_id
       AND a.dual_control_cents IS NOT NULL;
    IF v_threshold IS NOT NULL AND (new.amount * 100) > v_threshold THEN
      SELECT count(DISTINCT s.signer_id) INTO v_signers
        FROM public.approval_signoffs s
       WHERE s.approval_request_id = new.id;
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
         USING (organization_id = ANY ((SELECT public.auth_pro_org_ids(''cpa''))))', t || '_cpa_select', t);
  END LOOP;

  -- Child tables: through the parent's org.
  DROP POLICY IF EXISTS budget_line_items_cpa_select ON public.budget_line_items;
  CREATE POLICY budget_line_items_cpa_select ON public.budget_line_items FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.budgets b
                    WHERE b.id = budget_line_items.budget_id
                      AND b.organization_id = ANY ((SELECT public.auth_pro_org_ids('cpa')))));
  DROP POLICY IF EXISTS adjusting_entries_cpa_select ON public.adjusting_entries;
  CREATE POLICY adjusting_entries_cpa_select ON public.adjusting_entries FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.journal_entries je
                    WHERE je.id = adjusting_entries.journal_entry_id
                      AND je.organization_id = ANY ((SELECT public.auth_pro_org_ids('cpa')))));
  DROP POLICY IF EXISTS closing_entries_cpa_select ON public.closing_entries;
  CREATE POLICY closing_entries_cpa_select ON public.closing_entries FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.journal_entries je
                    WHERE je.id = closing_entries.journal_entry_id
                      AND je.organization_id = ANY ((SELECT public.auth_pro_org_ids('cpa')))));

  -- Attorney: the assigned matters.
  DROP POLICY IF EXISTS collection_cases_attorney_select ON public.collection_cases;
  CREATE POLICY collection_cases_attorney_select ON public.collection_cases FOR SELECT TO authenticated
    USING (id = ANY ((SELECT public.auth_attorney_matter_ids('collections_case'))));
  DROP POLICY IF EXISTS collection_events_attorney_select ON public.collection_events;
  CREATE POLICY collection_events_attorney_select ON public.collection_events FOR SELECT TO authenticated
    USING (collection_case_id = ANY ((SELECT public.auth_attorney_matter_ids('collections_case'))));
  DROP POLICY IF EXISTS hoa_violations_attorney_select ON public.hoa_violations;
  CREATE POLICY hoa_violations_attorney_select ON public.hoa_violations FOR SELECT TO authenticated
    USING (id = ANY ((SELECT public.auth_attorney_matter_ids('violation'))));
  DROP POLICY IF EXISTS violation_hearings_attorney_select ON public.violation_hearings;
  CREATE POLICY violation_hearings_attorney_select ON public.violation_hearings FOR SELECT TO authenticated
    USING (violation_id = ANY ((SELECT public.auth_attorney_matter_ids('violation'))));
  DROP POLICY IF EXISTS tickets_attorney_select ON public.tickets;
  CREATE POLICY tickets_attorney_select ON public.tickets FOR SELECT TO authenticated
    USING (category = 'records_request'
           AND id = ANY ((SELECT public.auth_attorney_matter_ids('records_request'))));

  -- The unit ledger of an assigned unit.
  DROP POLICY IF EXISTS assessments_attorney_select ON public.assessments;
  CREATE POLICY assessments_attorney_select ON public.assessments FOR SELECT TO authenticated
    USING (unit_id = ANY ((SELECT public.auth_attorney_unit_ids())));
  DROP POLICY IF EXISTS payments_attorney_select ON public.payments;
  CREATE POLICY payments_attorney_select ON public.payments FOR SELECT TO authenticated
    USING (unit_id = ANY ((SELECT public.auth_attorney_unit_ids())));

  -- General counsel.
  DROP POLICY IF EXISTS governing_documents_counsel_select ON public.governing_documents;
  CREATE POLICY governing_documents_counsel_select ON public.governing_documents FOR SELECT TO authenticated
    USING (organization_id = ANY ((SELECT public.auth_counsel_org_ids())));
  DROP POLICY IF EXISTS compliance_deadlines_done_counsel_select ON public.compliance_deadlines_done;
  CREATE POLICY compliance_deadlines_done_counsel_select ON public.compliance_deadlines_done FOR SELECT TO authenticated
    USING (organization_id = ANY ((SELECT public.auth_counsel_org_ids())));

  -- Both: the org's name (even once expired, so the app can say so) and
  -- the association's name and state.
  DROP POLICY IF EXISTS orgs_pro_select ON public.orgs;
  CREATE POLICY orgs_pro_select ON public.orgs FOR SELECT TO authenticated
    USING (public.auth_has_pro_membership(id));
  DROP POLICY IF EXISTS associations_pro_select ON public.associations;
  CREATE POLICY associations_pro_select ON public.associations FOR SELECT TO authenticated
    USING (organization_id = ANY ((SELECT public.auth_pro_org_ids())));
END
$mig$;

COMMIT;
