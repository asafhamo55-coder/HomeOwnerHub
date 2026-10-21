-- 0069_m5_batch.sql — migration batch M5 (round 4: BL-137; BL-141, BL-143
-- and BL-145 append their own parts when they land)
--
-- Apply: docs/specs/2026-10-20-sql-runbook.md, Section L. Needs
-- auth_is_board_or_admin(uuid) (0012), auth_org_ids() (0000),
-- auth_resident_unit_ids() (0061) and the budgets table (0006), all
-- asserted below. Independent of 0064–0068; RLS shape follows 0063.
--
-- Idempotent (safe to run any number of times):
--
--   1. BL-137  dues_rates: the association's dues-rate schedule. One row
--              per (association, effective_from): the amount per home and
--              how often it is billed (monthly / quarterly / semiannual /
--              annual), an optional link to the budget it was adopted from,
--              and a short note. `basis` leaves room for a future per-unit-
--              type or per-share rate (FL § 720.308(1) "proportional
--              share"); the app writes only 'per_home' today.
--              RLS: board/admin of the org read and write (0063 board
--              shape). A resident reads ONE row per association: the rate
--              in effect today for an association where they have a home
--              (auth_resident_unit_ids()), through the SECURITY DEFINER
--              helper dues_rates_resident_current_ids() (a policy cannot
--              query its own table without recursing).
--              The association must be the row's org's and the budget the
--              row's association's (trigger, 23503, also for the service
--              role). created_by is the caller for a signed-in user and
--              never changes (trigger, as 0067/0068 SEC-N6).
--
-- App code reads and writes none of this until M5_APPLIED
-- (packages/db/src/m5.ts) is flipped. Every app path works with the table
-- present and the flag false (CI replays this file).
--
-- No existing table is altered. All-or-nothing.

BEGIN;

DO $pre$
BEGIN
  IF to_regprocedure('public.auth_is_board_or_admin(uuid)') IS NULL THEN
    RAISE EXCEPTION '0069: auth_is_board_or_admin(uuid) is missing (0012)';
  END IF;
  IF to_regprocedure('public.auth_org_ids()') IS NULL THEN
    RAISE EXCEPTION '0069: auth_org_ids() is missing (0000)';
  END IF;
  IF to_regprocedure('public.auth_resident_unit_ids()') IS NULL THEN
    RAISE EXCEPTION '0069: auth_resident_unit_ids() is missing (0061)';
  END IF;
  IF to_regclass('public.budgets') IS NULL THEN
    RAISE EXCEPTION '0069: budgets is missing (0006)';
  END IF;
END $pre$;

-- ── 1. BL-137: dues_rates ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dues_rates (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid        NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  association_id    uuid        NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  effective_from    date        NOT NULL,
  -- apps/hoa/src/lib/dues-rates/model.ts RATE_BASES. per_home: amount_cents
  -- per home. per_unit_type: unit_type_amounts { "<type>": cents }, with
  -- amount_cents for any type not listed. per_share: amount_cents per 1.0
  -- share. Only per_home is written by the app today.
  basis             text        NOT NULL DEFAULT 'per_home'
                                CHECK (basis IN ('per_home', 'per_unit_type', 'per_share')),
  -- Per charge, at `frequency`. $0.01 to $100,000 (the billing form's cap).
  amount_cents      bigint      NOT NULL CHECK (amount_cents BETWEEN 1 AND 10000000),
  unit_type_amounts jsonb       NOT NULL DEFAULT '{}'::jsonb
                                CHECK (jsonb_typeof(unit_type_amounts) = 'object'),
  -- apps/hoa/src/lib/dues-rates/model.ts RATE_FREQUENCIES
  frequency         text        NOT NULL
                                CHECK (frequency IN ('monthly', 'quarterly', 'semiannual', 'annual')),
  budget_id         uuid        REFERENCES public.budgets(id) ON DELETE SET NULL,
  notes             text        CHECK (notes IS NULL OR length(notes) <= 500),
  created_by        uuid        REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dues_rates_basis_shape CHECK (
    (basis = 'per_unit_type') = (unit_type_amounts <> '{}'::jsonb)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS dues_rates_assoc_effective_uniq
  ON public.dues_rates (association_id, effective_from);
CREATE INDEX IF NOT EXISTS dues_rates_org_idx
  ON public.dues_rates (organization_id);
CREATE INDEX IF NOT EXISTS dues_rates_budget_idx
  ON public.dues_rates (budget_id)
  WHERE budget_id IS NOT NULL;

COMMENT ON TABLE public.dues_rates IS
  'BL-137: the association''s dues-rate schedule (amount per home, frequency, effective_from). Board/admin write; a resident reads only the rate in effect for their own association.';

-- The FKs prove the association and budget exist; this proves they belong
-- to the row (association in the org, budget in the association).
CREATE OR REPLACE FUNCTION public.dues_rates_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.associations a
                  WHERE a.id = new.association_id
                    AND a.organization_id = new.organization_id) THEN
    RAISE EXCEPTION 'dues_rates: association is not in this organization'
      USING errcode = '23503';
  END IF;
  IF new.budget_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.budgets b
        WHERE b.id = new.budget_id
          AND b.association_id = new.association_id) THEN
    RAISE EXCEPTION 'dues_rates: budget is not this association''s'
      USING errcode = '23503';
  END IF;
  RETURN new;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.dues_rates_scope() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS dues_rates_scope ON public.dues_rates;
CREATE TRIGGER dues_rates_scope
  BEFORE INSERT OR UPDATE OF association_id, organization_id, budget_id ON public.dues_rates
  FOR EACH ROW EXECUTE FUNCTION public.dues_rates_scope();

-- The rate in effect today (the database's date) for each association
-- where the caller has a home: the 0063 resident predicate (units in
-- auth_resident_unit_ids()). SECURITY DEFINER so the policy below can use
-- it without querying dues_rates under its own RLS. Returns only ids.
CREATE OR REPLACE FUNCTION public.dues_rates_resident_current_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE(
    ARRAY(
      SELECT DISTINCT ON (r.association_id) r.id
        FROM public.dues_rates r
       WHERE r.effective_from <= current_date
         AND r.association_id IN (
           SELECT u.association_id FROM public.units u
            WHERE u.id = ANY (public.auth_resident_unit_ids())
              AND u.association_id IS NOT NULL)
       ORDER BY r.association_id, r.effective_from DESC
    ),
    ARRAY[]::uuid[]
  );
$fn$;

REVOKE EXECUTE ON FUNCTION public.dues_rates_resident_current_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dues_rates_resident_current_ids() TO authenticated, service_role;

ALTER TABLE public.dues_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dues_rates_select ON public.dues_rates;
DROP POLICY IF EXISTS dues_rates_insert ON public.dues_rates;
DROP POLICY IF EXISTS dues_rates_update ON public.dues_rates;
DROP POLICY IF EXISTS dues_rates_delete ON public.dues_rates;

CREATE POLICY dues_rates_select ON public.dues_rates
  FOR SELECT TO authenticated
  USING (public.auth_is_board_or_admin(organization_id)
         OR (organization_id = ANY (public.auth_org_ids())
             AND id = ANY (public.dues_rates_resident_current_ids())));

CREATE POLICY dues_rates_insert ON public.dues_rates
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_is_board_or_admin(organization_id));

CREATE POLICY dues_rates_update ON public.dues_rates
  FOR UPDATE TO authenticated
  USING (public.auth_is_board_or_admin(organization_id))
  WITH CHECK (public.auth_is_board_or_admin(organization_id));

CREATE POLICY dues_rates_delete ON public.dues_rates
  FOR DELETE TO authenticated
  USING (public.auth_is_board_or_admin(organization_id));

-- Attribution (security review #2, SEC-N6, as 0067/0068): for a signed-in
-- caller (role `authenticated`, i.e. through PostgREST) created_by is the
-- caller on INSERT and never changes on UPDATE. SECURITY INVOKER on
-- purpose: current_user must be the caller's role. The service role is
-- left alone. updated_at moves on every UPDATE.
CREATE OR REPLACE FUNCTION public.dues_rates_attribution()
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
  IF tg_op = 'UPDATE' THEN
    new.updated_at := now();
  END IF;
  RETURN new;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.dues_rates_attribution() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS dues_rates_attribution ON public.dues_rates;
CREATE TRIGGER dues_rates_attribution
  BEFORE INSERT OR UPDATE ON public.dues_rates
  FOR EACH ROW EXECUTE FUNCTION public.dues_rates_attribution();

COMMIT;
