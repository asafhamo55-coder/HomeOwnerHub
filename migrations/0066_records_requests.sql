-- 0066_records_requests.sql — BL-123 item 3, owner records requests
--
-- Apply: docs/specs/2026-10-20-sql-runbook.md, Section I. Needs 0024
-- (tickets). Independent of 0063–0065.
--
-- Three parts, each idempotent (safe to run any number of times):
--
--   1. tickets.category CHECK also allows 'records_request'. Every value
--      0024 allowed is kept. Before this, inserting a records request
--      fails with 23514.
--   2. tickets.records_due_at timestamptz NULL: the statutory due day for
--      a records request, stored as that day at 17:00 UTC (see
--      apps/hoa/src/lib/records-requests/law.ts, STORAGE). NULL for every
--      other ticket and for states whose deadline is not loaded.
--   3. tickets_records_due_at_guard trigger: an authenticated caller who
--      is not board/admin of the ticket's org cannot set or change
--      records_due_at (42501). 0063's tickets_insert policy lets a
--      resident INSERT their own ticket with any column values, so
--      without this a resident posting to PostgREST directly could pick
--      their own statutory deadline. The app files the request with the
--      resident's client and then writes the due day with the service
--      role (apps/hoa/src/lib/records-requests/actions.ts). Service role
--      and direct SQL (no JWT) are unaffected.
--
-- Nothing reads or writes either until RECORDS_REQUESTS_LIVE
-- (packages/db/src/records-requests.ts) is flipped; that is a separate
-- one-line change after this is applied.
--
-- No table rewrite (a nullable column with no default is metadata-only),
-- no backfill. All-or-nothing.

BEGIN;

-- ── 1. tickets.category CHECK ─────────────────────────────────────────
-- 0024 declared the CHECK inline, so Postgres named it
-- tickets_category_check. Drop every CHECK on tickets that mentions
-- category (whatever its name, in case it was ever recreated by hand),
-- then add the widened one under the canonical name. Existing rows
-- already satisfy the wider list, so the ADD validates instantly.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.tickets'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%category%'
  LOOP
    EXECUTE format('ALTER TABLE public.tickets DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.tickets ADD CONSTRAINT tickets_category_check CHECK (category IN (
  'maintenance', 'noise', 'parking', 'common_area',
  'billing', 'access', 'safety', 'general', 'other',
  'records_request'
));

-- ── 2. tickets.records_due_at ─────────────────────────────────────────
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS records_due_at timestamptz;

COMMENT ON COLUMN public.tickets.records_due_at IS
  'BL-123: statutory due day for an owner records request (category records_request), stored as that day at 17:00 UTC. NULL otherwise.';

-- Open records requests by due day, for the board view and the digest.
CREATE INDEX IF NOT EXISTS tickets_records_due_idx
  ON public.tickets (organization_id, records_due_at)
  WHERE category = 'records_request' AND deleted_at IS NULL;

-- ── 3. records_due_at guard ───────────────────────────────────────────
-- Fires only when records_due_at is in the INSERT or in the UPDATE's SET
-- list. INSERT: refuses a non-null value. UPDATE: refuses any change
-- (clearing a deadline is tampering too). Residents cannot UPDATE tickets
-- at all under 0063, so the UPDATE arm is defence in depth. Same role
-- test as 0065's resident_sms_opt_in_self_only; board/admin is the same
-- SECURITY DEFINER helper the tickets RLS policies use.
CREATE OR REPLACE FUNCTION public.tickets_records_due_at_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
BEGIN
  IF tg_op = 'INSERT' THEN
    IF new.records_due_at IS NULL THEN
      RETURN new;
    END IF;
  ELSIF new.records_due_at IS NOT DISTINCT FROM old.records_due_at THEN
    RETURN new;
  END IF;
  IF v_role IN ('authenticated', 'anon')
     AND NOT coalesce(public.auth_is_board_or_admin(new.organization_id), false) THEN
    RAISE EXCEPTION 'records_due_at can only be set by the board or the server'
      USING errcode = '42501';
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS tickets_records_due_at_guard ON public.tickets;
CREATE TRIGGER tickets_records_due_at_guard
  BEFORE INSERT OR UPDATE OF records_due_at ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.tickets_records_due_at_guard();

COMMIT;
