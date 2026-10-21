-- 0068_m4_batch.sql — migration batch M4 (round 3: BL-132, BL-133)
--
-- Apply: docs/specs/2026-10-20-sql-runbook.md, Section K. Needs
-- auth_is_board_or_admin(uuid) (0012), auth_org_ids() (0000) and
-- auth_resident_unit_ids() (0061), all asserted below. Independent of
-- 0064–0067; RLS shape follows 0063.
--
-- Two parts, each idempotent (safe to run any number of times):
--
--   1. BL-132  insurance_policies: the association's insurance policies
--              and fidelity bond (kind, carrier, policy number, limit,
--              deductible, premium, effective and expiry dates, and an
--              optional link to the policy PDF in hoa_documents). Feeds
--              the board's expiry reminders (dashboard, daily digest) and
--              the coverage check (apps/hoa/src/lib/insurance/).
--              RLS: board/admin of the org only, the 0063 board-only shape
--              (select / insert / update / delete). Residents read nothing.
--              The association (if set) must be the row's org's (policy),
--              and so must the linked document (trigger, 23503).
--   2. BL-133  violation_hearings: one hearing record per violation
--              (the first slice of BL-030): the resident's request (when,
--              who, an optional written statement), the hearing date, time
--              and place, the panel or committee (names, each marked board
--              or member), the notice-sent date, the outcome and the
--              findings / payment-due dates. A trigger refuses a violation
--              from another org (23503).
--              RLS: board/admin of the org only, the 0063 board-only shape.
--              Residents get exactly one thing, through
--              request_violation_hearing(violation_id, statement)
--              (SECURITY DEFINER): record a request on a violation on
--              their OWN home (the 0063 hoa_violations_select resident
--              predicate), in their own org, that the board has not closed.
--              It never touches the board's columns. Residents read their
--              request back through the app (service role, after the app's
--              own-home check), not through PostgREST.
--
-- App code reads and writes none of this until M4_APPLIED
-- (packages/db/src/m4.ts) is flipped. Every app path works with the
-- tables present and the flag false (CI replays this file).
--
-- No existing table is altered. All-or-nothing.

BEGIN;

DO $pre$
BEGIN
  IF to_regprocedure('public.auth_is_board_or_admin(uuid)') IS NULL THEN
    RAISE EXCEPTION '0068: auth_is_board_or_admin(uuid) is missing (0012)';
  END IF;
  IF to_regprocedure('public.auth_org_ids()') IS NULL THEN
    RAISE EXCEPTION '0068: auth_org_ids() is missing (0000)';
  END IF;
  IF to_regprocedure('public.auth_resident_unit_ids()') IS NULL THEN
    RAISE EXCEPTION '0068: auth_resident_unit_ids() is missing (0061)';
  END IF;
END $pre$;

-- ── 1. BL-132: insurance_policies ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.insurance_policies (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid        NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  association_id       uuid        REFERENCES public.associations(id) ON DELETE CASCADE,
  -- apps/hoa/src/lib/insurance/model.ts POLICY_KINDS
  kind                 text        NOT NULL CHECK (kind IN (
                                     'property', 'liability', 'directors_officers', 'fidelity',
                                     'flood', 'earthquake', 'umbrella', 'workers_comp', 'other')),
  carrier              text        NOT NULL CHECK (length(btrim(carrier)) BETWEEN 1 AND 200),
  policy_number        text        CHECK (policy_number IS NULL OR length(policy_number) <= 100),
  coverage_limit_cents bigint      CHECK (coverage_limit_cents IS NULL OR coverage_limit_cents >= 0),
  deductible_cents     bigint      CHECK (deductible_cents IS NULL OR deductible_cents >= 0),
  premium_cents        bigint      CHECK (premium_cents IS NULL OR premium_cents >= 0),
  effective_on         date,
  expires_on           date        NOT NULL,
  document_id          uuid        REFERENCES public.hoa_documents(id) ON DELETE SET NULL,
  notes                text        CHECK (notes IS NULL OR length(notes) <= 2000),
  created_by           uuid        REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT insurance_policies_term_check CHECK (effective_on IS NULL OR effective_on < expires_on)
);

CREATE INDEX IF NOT EXISTS insurance_policies_org_expiry_idx
  ON public.insurance_policies (organization_id, expires_on);
CREATE INDEX IF NOT EXISTS insurance_policies_document_idx
  ON public.insurance_policies (document_id)
  WHERE document_id IS NOT NULL;

COMMENT ON TABLE public.insurance_policies IS
  'BL-132: the association''s insurance policies and fidelity bond, for expiry reminders and the coverage check. Board/admin only.';

-- The FK proves the document exists; this proves it is the same org's.
CREATE OR REPLACE FUNCTION public.insurance_policies_document_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF new.document_id IS NULL THEN
    RETURN new;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.hoa_documents d
                  WHERE d.id = new.document_id
                    AND d.org_id = new.organization_id) THEN
    RAISE EXCEPTION 'insurance_policies: document is not in this organization'
      USING errcode = '23503';
  END IF;
  RETURN new;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.insurance_policies_document_org() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS insurance_policies_document_org ON public.insurance_policies;
CREATE TRIGGER insurance_policies_document_org
  BEFORE INSERT OR UPDATE OF document_id, organization_id ON public.insurance_policies
  FOR EACH ROW EXECUTE FUNCTION public.insurance_policies_document_org();

ALTER TABLE public.insurance_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS insurance_policies_select ON public.insurance_policies;
DROP POLICY IF EXISTS insurance_policies_insert ON public.insurance_policies;
DROP POLICY IF EXISTS insurance_policies_update ON public.insurance_policies;
DROP POLICY IF EXISTS insurance_policies_delete ON public.insurance_policies;

CREATE POLICY insurance_policies_select ON public.insurance_policies
  FOR SELECT TO authenticated
  USING (public.auth_is_board_or_admin(organization_id));

CREATE POLICY insurance_policies_insert ON public.insurance_policies
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_is_board_or_admin(organization_id)
              AND (association_id IS NULL
                   OR EXISTS (SELECT 1 FROM public.associations a
                               WHERE a.id = association_id
                                 AND a.organization_id = insurance_policies.organization_id)));

CREATE POLICY insurance_policies_update ON public.insurance_policies
  FOR UPDATE TO authenticated
  USING (public.auth_is_board_or_admin(organization_id))
  WITH CHECK (public.auth_is_board_or_admin(organization_id)
              AND (association_id IS NULL
                   OR EXISTS (SELECT 1 FROM public.associations a
                               WHERE a.id = association_id
                                 AND a.organization_id = insurance_policies.organization_id)));

CREATE POLICY insurance_policies_delete ON public.insurance_policies
  FOR DELETE TO authenticated
  USING (public.auth_is_board_or_admin(organization_id));

-- ── 2. BL-133: violation_hearings ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.violation_hearings (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid        NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  violation_id       uuid        NOT NULL REFERENCES public.hoa_violations(id) ON DELETE CASCADE,
  -- apps/hoa/src/lib/violation-hearings/rules.ts HEARING_STATUSES
  status             text        NOT NULL DEFAULT 'requested'
                                 CHECK (status IN ('requested', 'scheduled', 'held', 'cancelled')),
  -- The resident's request (request_violation_hearing).
  requested_at       timestamptz,
  requested_by       uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  resident_statement text        CHECK (resident_statement IS NULL OR length(resident_statement) <= 4000),
  -- The board's record. Day + wall time in the association's zone, so no
  -- time-zone arithmetic is needed to show or count days.
  hearing_on         date,
  hearing_time       text        CHECK (hearing_time IS NULL OR hearing_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  location           text        CHECK (location IS NULL OR length(location) <= 300),
  -- [{ "name": text, "role": "board" | "member" }, ...]
  panel              jsonb       NOT NULL DEFAULT '[]'::jsonb
                                 CHECK (jsonb_typeof(panel) = 'array' AND jsonb_array_length(panel) <= 15),
  notice_sent_on     date,
  outcome            text        CHECK (outcome IS NULL OR outcome IN ('upheld', 'reduced', 'dismissed')),
  decided_on         date,
  findings_sent_on   date,
  payment_due_on     date,
  created_by         uuid        REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT violation_hearings_shape_check CHECK (
    (status NOT IN ('scheduled', 'held') OR hearing_on IS NOT NULL)
    AND (status <> 'held' OR outcome IS NOT NULL)
    AND (outcome IS NULL OR status = 'held')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS violation_hearings_violation_uniq
  ON public.violation_hearings (violation_id);
CREATE INDEX IF NOT EXISTS violation_hearings_org_idx
  ON public.violation_hearings (organization_id, status);

COMMENT ON TABLE public.violation_hearings IS
  'BL-133: the fine hearing for a violation (one per violation): the resident''s request, the date, panel, notice, outcome. Board/admin only; residents request through request_violation_hearing().';

-- The FK proves the violation exists; this proves it is the same org's.
CREATE OR REPLACE FUNCTION public.violation_hearings_violation_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.hoa_violations v
                  WHERE v.id = new.violation_id
                    AND v.org_id = new.organization_id) THEN
    RAISE EXCEPTION 'violation_hearings: violation is not in this organization'
      USING errcode = '23503';
  END IF;
  RETURN new;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.violation_hearings_violation_org() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS violation_hearings_violation_org ON public.violation_hearings;
CREATE TRIGGER violation_hearings_violation_org
  BEFORE INSERT OR UPDATE OF violation_id, organization_id ON public.violation_hearings
  FOR EACH ROW EXECUTE FUNCTION public.violation_hearings_violation_org();

ALTER TABLE public.violation_hearings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS violation_hearings_select ON public.violation_hearings;
DROP POLICY IF EXISTS violation_hearings_insert ON public.violation_hearings;
DROP POLICY IF EXISTS violation_hearings_update ON public.violation_hearings;
DROP POLICY IF EXISTS violation_hearings_delete ON public.violation_hearings;

CREATE POLICY violation_hearings_select ON public.violation_hearings
  FOR SELECT TO authenticated
  USING (public.auth_is_board_or_admin(organization_id));

CREATE POLICY violation_hearings_insert ON public.violation_hearings
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_is_board_or_admin(organization_id));

CREATE POLICY violation_hearings_update ON public.violation_hearings
  FOR UPDATE TO authenticated
  USING (public.auth_is_board_or_admin(organization_id))
  WITH CHECK (public.auth_is_board_or_admin(organization_id));

CREATE POLICY violation_hearings_delete ON public.violation_hearings
  FOR DELETE TO authenticated
  USING (public.auth_is_board_or_admin(organization_id));

-- The resident's one write: "I request a hearing" on a violation on their
-- own home. SECURITY DEFINER so it can write the row the resident has no
-- policy for; it checks, as the caller (auth.uid()):
--   * signed in;
--   * the violation is in one of the caller's orgs AND on one of the
--     caller's homes — the same predicate as 0063's hoa_violations_select
--     resident branch (units in auth_resident_unit_ids() via
--     legacy_hoa_property_id);
--   * the board has not closed it.
-- A second request is a no-op that keeps the first request's time, author
-- and statement. It never writes the board's columns (date, panel,
-- notice, outcome). Errors: 42501 not yours / not signed in, 22023 closed
-- or a statement over 4,000 characters. Returns the request time.
CREATE OR REPLACE FUNCTION public.request_violation_hearing(p_violation_id uuid, p_statement text DEFAULT NULL)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid       uuid := auth.uid();
  v_org       uuid;
  v_status    text;
  v_statement text := nullif(btrim(coalesce(p_statement, '')), '');
  v_at        timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'request_violation_hearing: not signed in' USING errcode = '42501';
  END IF;
  IF v_statement IS NOT NULL AND length(v_statement) > 4000 THEN
    RAISE EXCEPTION 'request_violation_hearing: statement too long' USING errcode = '22023';
  END IF;

  SELECT v.org_id, v.status INTO v_org, v_status
    FROM public.hoa_violations v
   WHERE v.id = p_violation_id
     AND v.org_id = ANY (public.auth_org_ids())
     AND v.property_id IN (
       SELECT u.legacy_hoa_property_id FROM public.units u
        WHERE u.id = ANY (public.auth_resident_unit_ids())
          AND u.legacy_hoa_property_id IS NOT NULL);
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'request_violation_hearing: not a violation on your home' USING errcode = '42501';
  END IF;
  IF v_status IN ('resolved', 'dismissed', 'waived', 'cured') THEN
    RAISE EXCEPTION 'request_violation_hearing: violation is closed' USING errcode = '22023';
  END IF;

  INSERT INTO public.violation_hearings AS h
         (organization_id, violation_id, status, requested_at, requested_by, resident_statement, created_by)
  VALUES (v_org, p_violation_id, 'requested', now(), v_uid, v_statement, v_uid)
  ON CONFLICT (violation_id) DO UPDATE
     SET requested_at       = now(),
         requested_by       = v_uid,
         resident_statement = coalesce(h.resident_statement, excluded.resident_statement),
         updated_at         = now()
   WHERE h.requested_at IS NULL;

  SELECT requested_at INTO v_at FROM public.violation_hearings WHERE violation_id = p_violation_id;
  RETURN v_at;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.request_violation_hearing(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_violation_hearing(uuid, text) TO authenticated;

COMMIT;
