-- 0069_m5_batch.sql — migration batch M5 (round 4: BL-137 part 1, BL-143
-- part 3; BL-141 (part 2) and BL-145 (part 4) append their own parts)
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
--   3. BL-143  Accept-to-join and self-claim for unlinked owners.
--              owner_join_codes: a one-time code the board issues for one
--              home (only its SHA-256 is stored; 30-day expiry, single use,
--              revocable). owner_join_requests: a signed-in account asking
--              to be linked to one home, by address or by code, waiting on
--              the board in /approvals. owner_join_attempts: every claim,
--              matched or not, for the rate limit (5 a rolling day).
--              RLS: codes and requests are board/admin-only (0063 board
--              shape; requests have no write policy at all); attempts have
--              no policy (definer functions only). An account never reads
--              a request row: owner_join_claim() answers 'sent' whether or
--              not the address matched a home, so a non-member cannot learn
--              whether an address exists. owner_join_decide() (board/admin
--              of the request's org, else 42501) approves — resident
--              membership plus an ownership link, in one transaction — or
--              rejects with a reason; both audited (ids only).
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
  IF to_regclass('public.ownerships') IS NULL OR to_regclass('public.units') IS NULL THEN
    RAISE EXCEPTION '0069: units/ownerships are missing (0004)';
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

-- ── 3. BL-143: accept-to-join and self-claim ──────────────────────────
-- A signed-in account (an owner already in this HOA with no home linked,
-- or an account in no HOA at all — SEC-N4) asks to be linked to one home,
-- by its address or by a code the board handed out. The board approves or
-- rejects in /approvals; approving makes them a resident of the HOA and
-- links the home. Nothing about a home is ever returned to the asker.

-- Address normalisation: lower case, punctuation to spaces, common street
-- words shortened ("Street" → "st"), so "12 Oak Street" = "12 oak st.".
-- apps/hoa/src/lib/owner-join/model.ts normaliseAddress mirrors it.
CREATE OR REPLACE FUNCTION public.owner_join_norm_address(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT COALESCE(string_agg(
           CASE t.w
             WHEN 'street' THEN 'st' WHEN 'avenue' THEN 'ave' WHEN 'av' THEN 'ave'
             WHEN 'road' THEN 'rd' WHEN 'drive' THEN 'dr' WHEN 'lane' THEN 'ln'
             WHEN 'court' THEN 'ct' WHEN 'boulevard' THEN 'blvd' WHEN 'circle' THEN 'cir'
             WHEN 'place' THEN 'pl' WHEN 'terrace' THEN 'ter' WHEN 'parkway' THEN 'pkwy'
             WHEN 'highway' THEN 'hwy' WHEN 'trail' THEN 'trl' WHEN 'cove' THEN 'cv'
             WHEN 'square' THEN 'sq' WHEN 'point' THEN 'pt'
             WHEN 'north' THEN 'n' WHEN 'south' THEN 's' WHEN 'east' THEN 'e' WHEN 'west' THEN 'w'
             WHEN 'northeast' THEN 'ne' WHEN 'northwest' THEN 'nw'
             WHEN 'southeast' THEN 'se' WHEN 'southwest' THEN 'sw'
             ELSE t.w
           END, ' ' ORDER BY t.i), '')
    FROM unnest(regexp_split_to_array(
           btrim(regexp_replace(lower(COALESCE(p, '')), '[^a-z0-9]+', ' ', 'g')), ' '))
         WITH ORDINALITY AS t(w, i)
   WHERE t.w <> '';
$fn$;

-- "Apt 4B", "Unit #4b", "4B" → "4b". model.ts normaliseUnit mirrors it.
CREATE OR REPLACE FUNCTION public.owner_join_norm_unit(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT regexp_replace(
           regexp_replace(lower(COALESCE(p, '')), '\m(apartment|apt|unit|suite|ste|number|no)\M', '', 'g'),
           '[^a-z0-9]', '', 'g');
$fn$;

-- The first five digits of a ZIP code. model.ts normaliseZip mirrors it.
CREATE OR REPLACE FUNCTION public.owner_join_norm_zip(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT left(regexp_replace(COALESCE(p, ''), '[^0-9]', '', 'g'), 5);
$fn$;

REVOKE EXECUTE ON FUNCTION public.owner_join_norm_address(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.owner_join_norm_unit(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.owner_join_norm_zip(text) FROM PUBLIC, anon, authenticated;

-- 3a. Board-issued join codes. Only the SHA-256 (hex) of the normalised
-- code (upper case, letters and digits only) is stored; the board sees the
-- code once, when it is made. Single use, 30 days in the app (90 at most).
CREATE TABLE IF NOT EXISTS public.owner_join_codes (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  unit_id         uuid        NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  code_hash       text        NOT NULL CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at      timestamptz NOT NULL,
  used_at         timestamptz,
  used_by         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at      timestamptz,
  created_by      uuid        REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT owner_join_codes_expiry
    CHECK (expires_at > created_at AND expires_at <= created_at + interval '90 days')
);

CREATE UNIQUE INDEX IF NOT EXISTS owner_join_codes_hash_uniq
  ON public.owner_join_codes (code_hash);
CREATE INDEX IF NOT EXISTS owner_join_codes_org_idx
  ON public.owner_join_codes (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS owner_join_codes_unit_idx
  ON public.owner_join_codes (unit_id);

COMMENT ON TABLE public.owner_join_codes IS
  'BL-143: one-time codes a board issues so an owner can ask to join for one home. Only the SHA-256 is stored. Board/admin only.';

-- 3b. Requests to join, waiting on the board. Written only by
-- owner_join_claim() and decided only by owner_join_decide().
-- requester_email / requester_name are what the asker's account says, so
-- the board can tell who is asking (a board cannot read a non-member's
-- profile).
CREATE TABLE IF NOT EXISTS public.owner_join_requests (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  unit_id         uuid        NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  requester_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requester_email text        CHECK (requester_email IS NULL OR length(requester_email) <= 320),
  requester_name  text        CHECK (requester_name IS NULL OR length(requester_name) <= 200),
  method          text        NOT NULL CHECK (method IN ('address', 'code')),
  code_id         uuid        REFERENCES public.owner_join_codes(id) ON DELETE SET NULL,
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by      uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at      timestamptz,
  decision_note   text        CHECK (decision_note IS NULL OR length(decision_note) <= 1000),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT owner_join_requests_decided CHECK ((status = 'pending') = (decided_at IS NULL)),
  CONSTRAINT owner_join_requests_code_method CHECK (method = 'code' OR code_id IS NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS owner_join_requests_pending_uniq
  ON public.owner_join_requests (requester_id, unit_id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS owner_join_requests_org_status_idx
  ON public.owner_join_requests (organization_id, status, created_at);
CREATE INDEX IF NOT EXISTS owner_join_requests_unit_idx
  ON public.owner_join_requests (unit_id);

COMMENT ON TABLE public.owner_join_requests IS
  'BL-143: an account asking to be linked to a home (by address or board code). Board/admin read; written only by owner_join_claim() and owner_join_decide().';

-- 3c. Every claim, matched or not: the rate limit, and "you asked on …"
-- for the asker (owner_join_my_status). No policy: definer functions only.
CREATE TABLE IF NOT EXISTS public.owner_join_attempts (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  method       text        NOT NULL CHECK (method IN ('address', 'code')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS owner_join_attempts_requester_idx
  ON public.owner_join_attempts (requester_id, created_at DESC);

COMMENT ON TABLE public.owner_join_attempts IS
  'BL-143: one row per join claim (matched or not) for the rate limit. No RLS policy: read and written only by SECURITY DEFINER functions.';

-- The code's home must be in the code's org (23503, also for the service
-- role).
CREATE OR REPLACE FUNCTION public.owner_join_codes_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.units u
                  WHERE u.id = new.unit_id
                    AND u.organization_id = new.organization_id) THEN
    RAISE EXCEPTION 'owner_join_codes: home is not in this organization'
      USING errcode = '23503';
  END IF;
  RETURN new;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.owner_join_codes_scope() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS owner_join_codes_scope ON public.owner_join_codes;
CREATE TRIGGER owner_join_codes_scope
  BEFORE INSERT OR UPDATE OF unit_id, organization_id ON public.owner_join_codes
  FOR EACH ROW EXECUTE FUNCTION public.owner_join_codes_scope();

-- Attribution (SEC-N6, as dues_rates): for a signed-in caller (role
-- `authenticated`) created_by is the caller on INSERT and never changes,
-- and a code is born unused. On UPDATE only revoked_at and expires_at can
-- move: the hash, the home and the use stamp stay as they were.
CREATE OR REPLACE FUNCTION public.owner_join_codes_attribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF current_user = 'authenticated' THEN
    IF tg_op = 'INSERT' THEN
      new.created_by := auth.uid();
      new.used_at := NULL;
      new.used_by := NULL;
      new.created_at := now();
    ELSE
      new.created_by := old.created_by;
      new.code_hash := old.code_hash;
      new.unit_id := old.unit_id;
      new.organization_id := old.organization_id;
      new.used_at := old.used_at;
      new.used_by := old.used_by;
      new.created_at := old.created_at;
    END IF;
  END IF;
  RETURN new;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.owner_join_codes_attribution() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS owner_join_codes_attribution ON public.owner_join_codes;
CREATE TRIGGER owner_join_codes_attribution
  BEFORE INSERT OR UPDATE ON public.owner_join_codes
  FOR EACH ROW EXECUTE FUNCTION public.owner_join_codes_attribution();

ALTER TABLE public.owner_join_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_join_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS owner_join_codes_select ON public.owner_join_codes;
DROP POLICY IF EXISTS owner_join_codes_insert ON public.owner_join_codes;
DROP POLICY IF EXISTS owner_join_codes_update ON public.owner_join_codes;
DROP POLICY IF EXISTS owner_join_codes_delete ON public.owner_join_codes;
DROP POLICY IF EXISTS owner_join_requests_select ON public.owner_join_requests;

CREATE POLICY owner_join_codes_select ON public.owner_join_codes
  FOR SELECT TO authenticated
  USING (public.auth_is_board_or_admin(organization_id));

CREATE POLICY owner_join_codes_insert ON public.owner_join_codes
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_is_board_or_admin(organization_id));

CREATE POLICY owner_join_codes_update ON public.owner_join_codes
  FOR UPDATE TO authenticated
  USING (public.auth_is_board_or_admin(organization_id))
  WITH CHECK (public.auth_is_board_or_admin(organization_id));

CREATE POLICY owner_join_codes_delete ON public.owner_join_codes
  FOR DELETE TO authenticated
  USING (public.auth_is_board_or_admin(organization_id));

-- Requests: board/admin read; nobody writes through PostgREST (no INSERT,
-- UPDATE or DELETE policy). The asker never reads a request row.
CREATE POLICY owner_join_requests_select ON public.owner_join_requests
  FOR SELECT TO authenticated
  USING (public.auth_is_board_or_admin(organization_id));

-- Ask to join: p_code, or p_address + p_postal_code (+ p_unit for a
-- building with several homes at one street address). Returns
--   'sent'         a valid claim. Said whether or not an address matched
--                  a home (exactly one home by street, ZIP and unit), so
--                  the answer never reveals that an address exists;
--   'invalid_code' a code claim with no live code (the code is the
--                  board's, not an address, so saying so leaks nothing);
--   'invalid'      the input is not a claim (nothing recorded);
--   'rate_limited' 5 claims in the last 24 hours (nothing recorded).
-- Every valid claim, matched or not, is one owner_join_attempts row.
CREATE OR REPLACE FUNCTION public.owner_join_claim(
  p_address     text DEFAULT NULL,
  p_postal_code text DEFAULT NULL,
  p_unit        text DEFAULT NULL,
  p_code        text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid     uuid := auth.uid();
  v_code    text := upper(regexp_replace(COALESCE(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_addr    text := public.owner_join_norm_address(p_address);
  v_zip     text := public.owner_join_norm_zip(p_postal_code);
  v_unit    text := public.owner_join_norm_unit(p_unit);
  v_by_code boolean;
  v_count   integer;
  v_code_id uuid;
  v_unit_id uuid;
  v_org     uuid;
  v_email   text;
  v_name    text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'owner_join_claim: sign in first' USING errcode = '42501';
  END IF;

  v_by_code := v_code <> '';
  IF v_by_code THEN
    IF length(v_code) <> 10 OR v_addr <> '' THEN
      RETURN 'invalid';
    END IF;
  ELSIF v_addr = '' OR length(v_zip) <> 5
        OR length(COALESCE(p_address, '')) > 200
        OR length(COALESCE(p_unit, '')) > 40 THEN
    RETURN 'invalid';
  END IF;

  -- One claim at a time per account, so the count below is exact.
  PERFORM pg_advisory_xact_lock(hashtextextended('owner_join_claim:' || v_uid::text, 0));
  SELECT count(*) INTO v_count
    FROM public.owner_join_attempts a
   WHERE a.requester_id = v_uid
     AND a.created_at > now() - interval '24 hours';
  IF v_count >= 5 THEN
    RETURN 'rate_limited';
  END IF;
  INSERT INTO public.owner_join_attempts (requester_id, method)
  VALUES (v_uid, CASE WHEN v_by_code THEN 'code' ELSE 'address' END);

  IF v_by_code THEN
    SELECT c.id, c.unit_id, c.organization_id
      INTO v_code_id, v_unit_id, v_org
      FROM public.owner_join_codes c
     WHERE c.code_hash = encode(sha256(convert_to(v_code, 'UTF8')), 'hex')
       AND c.used_at IS NULL
       AND c.revoked_at IS NULL
       AND c.expires_at > now()
     FOR UPDATE;
    IF v_code_id IS NULL THEN
      RETURN 'invalid_code';
    END IF;
    UPDATE public.owner_join_codes
       SET used_at = now(), used_by = v_uid
     WHERE id = v_code_id;
  ELSE
    SELECT count(*), (array_agg(u.id))[1], (array_agg(u.organization_id))[1]
      INTO v_count, v_unit_id, v_org
      FROM public.units u
     WHERE public.owner_join_norm_zip(u.postal_code) = v_zip
       AND public.owner_join_norm_address(u.address_line1) = v_addr
       AND (v_unit = '' OR public.owner_join_norm_unit(u.unit_number) = v_unit);
    IF v_count <> 1 THEN
      RETURN 'sent';
    END IF;
  END IF;

  -- Already linked to that home: nothing for the board to decide.
  IF EXISTS (SELECT 1 FROM public.ownerships o
              WHERE o.unit_id = v_unit_id
                AND o.owner_user_id = v_uid
                AND o.valid_to IS NULL) THEN
    RETURN 'sent';
  END IF;

  SELECT au.email INTO v_email FROM auth.users au WHERE au.id = v_uid;
  SELECT p.full_name INTO v_name FROM public.profiles p WHERE p.id = v_uid;

  INSERT INTO public.owner_join_requests
    (organization_id, unit_id, requester_id, requester_email, requester_name, method, code_id)
  VALUES
    (v_org, v_unit_id, v_uid, left(v_email, 320), left(v_name, 200),
     CASE WHEN v_by_code THEN 'code' ELSE 'address' END, v_code_id)
  ON CONFLICT (requester_id, unit_id) WHERE status = 'pending' DO NOTHING;

  RETURN 'sent';
END;
$fn$;

-- The caller's own claims: how many in the last 24 hours, the limit, and
-- when the last one was. Says nothing about any home or request.
CREATE OR REPLACE FUNCTION public.owner_join_my_status()
RETURNS TABLE (attempts_today integer, daily_limit integer, last_attempt_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT (count(*) FILTER (WHERE a.created_at > now() - interval '24 hours'))::integer,
         5,
         max(a.created_at)
    FROM public.owner_join_attempts a
   WHERE a.requester_id = auth.uid();
$fn$;

-- Decide a request: board/admin of its org only (else 42501, the same
-- error for a request that does not exist). Approve adds the asker as a
-- resident of the HOA (an existing membership is kept as it is) and links
-- the home: their open ownership if there is one, else the open ownership
-- on file under their sign-in email, else a new ownership row (source
-- 'join_request'). Reject needs a reason (22023). Audited with ids only.
-- Returns 'approved', 'rejected' or 'already_decided'.
CREATE OR REPLACE FUNCTION public.owner_join_decide(
  p_request_id uuid,
  p_approve    boolean,
  p_note       text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid     uuid := auth.uid();
  v_note    text := NULLIF(btrim(COALESCE(p_note, '')), '');
  r         public.owner_join_requests%ROWTYPE;
  v_email   text;
  v_own     uuid;
  v_outcome text;
BEGIN
  SELECT * INTO r FROM public.owner_join_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_uid IS NULL
     OR NOT COALESCE(public.auth_is_board_or_admin(r.organization_id), false) THEN
    RAISE EXCEPTION 'owner_join_decide: not allowed' USING errcode = '42501';
  END IF;
  IF r.status <> 'pending' THEN
    RETURN 'already_decided';
  END IF;

  IF NOT COALESCE(p_approve, false) THEN
    IF v_note IS NULL THEN
      RAISE EXCEPTION 'owner_join_decide: a reason is required' USING errcode = '22023';
    END IF;
    UPDATE public.owner_join_requests
       SET status = 'rejected', decided_by = v_uid, decided_at = now(),
           decision_note = left(v_note, 1000)
     WHERE id = r.id;
    INSERT INTO public.audit_log (org_id, user_id, action, entity_type, entity_id, metadata)
    VALUES (r.organization_id, v_uid, 'members.join_rejected', 'owner_join_request', r.id,
            jsonb_build_object('unit_id', r.unit_id, 'method', r.method));
    RETURN 'rejected';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.units u
                  WHERE u.id = r.unit_id AND u.organization_id = r.organization_id) THEN
    RAISE EXCEPTION 'owner_join_decide: home is not in this organization' USING errcode = '23503';
  END IF;

  INSERT INTO public.org_members (org_id, user_id, role, joined_at)
  VALUES (r.organization_id, r.requester_id, 'resident', now())
  ON CONFLICT (org_id, user_id) DO NOTHING;

  SELECT au.email INTO v_email FROM auth.users au WHERE au.id = r.requester_id;

  SELECT o.id INTO v_own
    FROM public.ownerships o
   WHERE o.organization_id = r.organization_id
     AND o.unit_id = r.unit_id
     AND o.owner_user_id = r.requester_id
     AND o.valid_to IS NULL
   LIMIT 1;
  IF v_own IS NOT NULL THEN
    v_outcome := 'existing';
  ELSE
    IF v_email IS NOT NULL THEN
      SELECT o.id INTO v_own
        FROM public.ownerships o
       WHERE o.organization_id = r.organization_id
         AND o.unit_id = r.unit_id
         AND o.owner_user_id IS NULL
         AND o.valid_to IS NULL
         AND lower(o.owner_email) = lower(v_email)
       ORDER BY o.valid_from DESC
       LIMIT 1;
    END IF;
    IF v_own IS NOT NULL THEN
      UPDATE public.ownerships SET owner_user_id = r.requester_id WHERE id = v_own;
      v_outcome := 'linked';
    ELSE
      INSERT INTO public.ownerships
        (organization_id, unit_id, owner_user_id, owner_name, owner_email, ownership_pct, valid_from, source)
      VALUES
        (r.organization_id, r.unit_id, r.requester_id, r.requester_name, v_email, 100, current_date, 'join_request');
      v_outcome := 'opened';
    END IF;
  END IF;

  UPDATE public.owner_join_requests
     SET status = 'approved', decided_by = v_uid, decided_at = now(),
         decision_note = left(v_note, 1000)
   WHERE id = r.id;
  INSERT INTO public.audit_log (org_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (r.organization_id, v_uid, 'members.join_approved', 'owner_join_request', r.id,
          jsonb_build_object('unit_id', r.unit_id, 'method', r.method, 'link', v_outcome));
  RETURN 'approved';
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.owner_join_claim(text, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.owner_join_my_status() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.owner_join_decide(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_join_claim(text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owner_join_my_status() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owner_join_decide(uuid, boolean, text) TO authenticated, service_role;

COMMIT;
