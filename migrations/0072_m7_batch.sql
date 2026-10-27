-- 0072_m7_batch.sql — migration batch M7
--   BL-166  certified-mail tracking on collection events
--   BL-177  atomic multi-charge payment recording, plus unapplied credit
--   BL-176  association state / governing-law state / type: admin-only at
--           the database
--
-- Apply: docs/specs/2026-10-20-sql-runbook.md, Section O (pre-checks first).
-- Needs 0070 (tenant_fk_same_org, the org-scoped auth helpers) and 0071 (M6),
-- plus collection_events (0047), the money tables (0006), associations (0004).
-- All asserted below.
--
-- App code reads and writes none of this until M7_APPLIED
-- (packages/db/src/m7.ts) is flipped. All-or-nothing, idempotent.
--
--   1. BL-166. collection_events gains four NULLABLE columns: mail_method
--      ('certified', 'statutory_overnight', 'first_class', 'email', 'hand'),
--      tracking_number, mailed_on, delivered_on. The table stays
--      append-only: no UPDATE or DELETE policy is added (a delivery that
--      is learned later is a NEW event that repeats the tracking number).
--      The existing rules already cover the new columns because every one
--      of them is a ROW rule: board_insert (WITH CHECK org = ANY
--      auth_org_ids() AND board/admin) refuses a row for another org
--      whatever columns it carries, board_read and the 0071 attorney
--      policy return whole rows. No rule names a column list, so nothing
--      needs widening; the post-check below fails the migration if anyone
--      has since added an UPDATE or DELETE policy. CHECKs: the method is
--      one of five; a tracking number or either date needs a method; a
--      tracking number is 1..100 characters; delivered_on is not before
--      mailed_on.
--   2. BL-177. unapplied_credits (org-scoped; board/admin read and write;
--      a resident reads the credit on their own unit) and
--      record_lump_payment(org, unit, parts, method, paid_on, note): one
--      transaction posts every part (a payments row, a balanced cash-
--      receipt journal entry, the charge's new status), or none. A part
--      with "kind":"credit" books money beyond what is due as an unapplied
--      credit (cash in, Prepaid Assessments 2100 out; Accounts Receivable
--      when a chart has no 2100). SECURITY DEFINER; refuses a caller with
--      no session in its body; board/admin of the org only; every charge
--      must belong to that org AND that unit and be open; more than a
--      charge has left is refused (23514), as is a repeated charge; the
--      search_path is pinned; EXECUTE is revoked from PUBLIC and anon.
--      unapplied_credits' foreign keys get the same-org triggers
--      (tenant_fk_same_org, the ratchet in
--      tests/integration/schema/fk-same-org-ratchet.test.ts).
--      apply_unapplied_credit(org, credit, assessment, cents) puts credit against a
--      charge (same guards). next_journal_entry_number(association, year) is the ONE
--      numbering path for journal entries (an atomic counter per association and
--      year); record_lump_payment and the app both use it.
--   3. BL-176. A BEFORE UPDATE trigger on associations: changing state,
--      governing_law_state or type needs auth_is_admin(org) or the service
--      role (42501). A board member's REST PATCH of those columns is
--      refused; every other column is untouched (0071's dual-control guard
--      is a separate trigger and stays).

BEGIN;

-- ── 0. prerequisites ───────────────────────────────────────────────────
DO $pre$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'orgs', 'profiles', 'associations', 'units', 'assessments', 'payments',
    'journal_entries', 'ledger_entries', 'fiscal_periods', 'funds',
    'chart_of_accounts', 'collection_cases', 'collection_events', 'audit_log'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION '0072: public.% is missing', t;
    END IF;
  END LOOP;
  IF to_regprocedure('public.tenant_fk_same_org()') IS NULL THEN
    RAISE EXCEPTION '0072: tenant_fk_same_org() is missing; apply 0070_tenant_isolation.sql first';
  END IF;
  IF to_regprocedure('public.auth_is_board_or_admin(uuid)') IS NULL
     OR to_regprocedure('public.auth_is_admin(uuid)') IS NULL
     OR to_regprocedure('public.auth_org_ids()') IS NULL
     OR to_regprocedure('public.auth_resident_unit_ids()') IS NULL THEN
    RAISE EXCEPTION '0072: an auth helper is missing (0012, 0061, 0070)';
  END IF;
  IF to_regclass('public.matter_assignments') IS NULL THEN
    RAISE EXCEPTION '0072: apply 0071_m6_roles.sql first (matter_assignments is missing)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'assessments'
                    AND column_name = 'deleted_at') THEN
    RAISE EXCEPTION '0072: assessments.deleted_at is missing (0047)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'collection_events'
                AND column_name IN ('mail_method', 'tracking_number', 'mailed_on', 'delivered_on', 'delivery_for_event_id'))
     AND NOT (SELECT count(*) = 5 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'collection_events'
                 AND column_name IN ('mail_method', 'tracking_number', 'mailed_on', 'delivered_on', 'delivery_for_event_id')) THEN
    RAISE EXCEPTION '0072: collection_events has some but not all of the mail columns; stop and ask';
  END IF;
END $pre$;

-- ── 1. BL-166: certified-mail tracking on collection events ────────────
ALTER TABLE public.collection_events ADD COLUMN IF NOT EXISTS mail_method     text;
ALTER TABLE public.collection_events ADD COLUMN IF NOT EXISTS tracking_number text;
ALTER TABLE public.collection_events ADD COLUMN IF NOT EXISTS mailed_on       date;
ALTER TABLE public.collection_events ADD COLUMN IF NOT EXISTS delivered_on    date;

-- A later delivery event points at the event it delivers (the letter's print or mailing
-- event). Older rows keep matching by tracking number. Same-org trigger below.
ALTER TABLE public.collection_events ADD COLUMN IF NOT EXISTS delivery_for_event_id uuid
  REFERENCES public.collection_events(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS collection_events_delivery_for_idx
  ON public.collection_events (delivery_for_event_id) WHERE delivery_for_event_id IS NOT NULL;

ALTER TABLE public.collection_events DROP CONSTRAINT IF EXISTS collection_events_mail_method_check;
ALTER TABLE public.collection_events ADD CONSTRAINT collection_events_mail_method_check
  CHECK (mail_method IS NULL
         OR mail_method IN ('certified', 'statutory_overnight', 'first_class', 'email', 'hand'));

ALTER TABLE public.collection_events DROP CONSTRAINT IF EXISTS collection_events_tracking_number_check;
ALTER TABLE public.collection_events ADD CONSTRAINT collection_events_tracking_number_check
  CHECK (tracking_number IS NULL OR char_length(btrim(tracking_number)) BETWEEN 1 AND 100);

ALTER TABLE public.collection_events DROP CONSTRAINT IF EXISTS collection_events_mail_needs_method_check;
ALTER TABLE public.collection_events ADD CONSTRAINT collection_events_mail_needs_method_check
  CHECK (mail_method IS NOT NULL
         OR (tracking_number IS NULL AND mailed_on IS NULL AND delivered_on IS NULL));

ALTER TABLE public.collection_events DROP CONSTRAINT IF EXISTS collection_events_mail_dates_check;
ALTER TABLE public.collection_events ADD CONSTRAINT collection_events_mail_dates_check
  CHECK (mailed_on IS NULL OR delivered_on IS NULL OR delivered_on >= mailed_on);

ALTER TABLE public.collection_events DROP CONSTRAINT IF EXISTS collection_events_delivery_link_check;
ALTER TABLE public.collection_events ADD CONSTRAINT collection_events_delivery_link_check
  CHECK (delivery_for_event_id IS NULL OR (mail_method IS NOT NULL AND delivered_on IS NOT NULL));

COMMENT ON COLUMN public.collection_events.mail_method IS
  'BL-166: how a notice was sent (certified, statutory_overnight, first_class, email, hand). Append-only like the rest of the row.';
COMMENT ON COLUMN public.collection_events.delivered_on IS
  'BL-166: the day the owner RECEIVED the notice. The Georgia 30-day fee-notice clock and the 60-day pre-foreclosure clock count from here, not from the print date.';

-- ── 2. BL-177: unapplied credit ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.unapplied_credits (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  association_id   uuid NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  unit_id          uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  amount           numeric(14,2) NOT NULL CHECK (amount > 0),
  remaining        numeric(14,2) NOT NULL CHECK (remaining >= 0),
  payment_method   text NOT NULL
    CHECK (payment_method IN ('ach', 'card', 'apple_pay', 'google_pay', 'zelle_assisted', 'check', 'cash', 'other')),
  received_on      date NOT NULL,
  note             text CHECK (note IS NULL OR char_length(note) <= 500),
  journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  created_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (remaining <= amount)
);

CREATE INDEX IF NOT EXISTS unapplied_credits_unit_idx
  ON public.unapplied_credits (unit_id) WHERE remaining > 0;
CREATE INDEX IF NOT EXISTS unapplied_credits_org_created_idx
  ON public.unapplied_credits (organization_id, created_at DESC);

COMMENT ON TABLE public.unapplied_credits IS
  'BL-177: money received beyond what a home owed. Written by record_lump_payment() (cash in, Prepaid Assessments out); remaining falls as a later change applies it. Board/admin read and write; a resident reads their own unit.';

DO $triggers$
DECLARE
  r record;
  v_name text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('collection_events', 'delivery_for_event_id', 'collection_events', 'organization_id', 'organization_id'),
      ('unapplied_credits', 'unit_id',          'units',           'organization_id', 'organization_id'),
      ('unapplied_credits', 'association_id',   'associations',    'organization_id', 'organization_id'),
      ('unapplied_credits', 'journal_entry_id', 'journal_entries', 'organization_id', 'organization_id')
    ) v(child, fk, parent, parent_org, child_org)
  LOOP
    -- AFTER ROW, like Postgres's own foreign-key checks: row level security (WITH CHECK, 42501) and the
    -- hand-written BEFORE scope triggers run first and keep their error codes; a genuine cross-org link
    -- still raises 23503 here and aborts the statement. Named zz_org_fk_*; a name over 63 bytes is cut
    -- and given a short deterministic hash.
    v_name := 'zz_org_fk_' || r.child || '_' || r.fk;
    IF octet_length(v_name) > 63 THEN
      v_name := left(v_name, 54) || '_' || substr(md5(v_name), 1, 8);
    END IF;
    -- Also drop the earlier <child>_<col>_org_scope name, in case of a partial earlier apply.
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', r.child || '_' || r.fk || '_org_scope', r.child);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', v_name, r.child);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OF %I, %I ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.tenant_fk_same_org(%L, %L, %L, %L)',
      v_name, r.fk, r.child_org, r.child,
      r.fk, r.parent, r.parent_org, r.child_org);
  END LOOP;
END $triggers$;

ALTER TABLE public.unapplied_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS unapplied_credits_board ON public.unapplied_credits;
CREATE POLICY unapplied_credits_board ON public.unapplied_credits
  FOR ALL TO authenticated
  USING      (organization_id = ANY (public.auth_org_ids())
              AND public.auth_is_board_or_admin(organization_id))
  WITH CHECK (organization_id = ANY (public.auth_org_ids())
              AND public.auth_is_board_or_admin(organization_id));

DROP POLICY IF EXISTS unapplied_credits_resident_select ON public.unapplied_credits;
CREATE POLICY unapplied_credits_resident_select ON public.unapplied_credits
  FOR SELECT TO authenticated
  USING (organization_id = ANY (public.auth_org_ids())
         AND unit_id = ANY ((SELECT public.auth_resident_unit_ids())::uuid[]));


-- One numbering path for journal entries. The app (postJournalEntry) and
-- record_lump_payment both take the next number from here: an atomic upsert on
-- a per-association, per-year counter, so two writers can never be handed the
-- same number (the row lock lasts until the caller's transaction ends). The
-- counter starts from the highest number already used. RLS is on with no
-- policy: only this function (and the service role) touches the table.
CREATE TABLE IF NOT EXISTS public.je_number_counters (
  association_id uuid NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  year           text NOT NULL CHECK (year ~ '^[0-9]{4}$'),
  last_seq       integer NOT NULL CHECK (last_seq >= 0),
  PRIMARY KEY (association_id, year)
);
ALTER TABLE public.je_number_counters ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.next_journal_entry_number(p_association uuid, p_year text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid    uuid := auth.uid();
  v_org    uuid;
  v_prefix text;
  v_used   integer;
  v_seq    integer;
BEGIN
  -- A signed-in board member / admin of the association's org, or the service role
  -- (jobs post journal entries with it). Anyone else, including anon, is refused.
  IF v_uid IS NULL AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'next_journal_entry_number: sign in first' USING errcode = '42501';
  END IF;
  IF p_year IS NULL OR p_year !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'next_journal_entry_number: bad year' USING errcode = '22023';
  END IF;
  SELECT a.organization_id INTO v_org FROM public.associations a WHERE a.id = p_association;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'next_journal_entry_number: not authorized' USING errcode = '42501';
  END IF;
  IF v_uid IS NOT NULL AND NOT public.auth_is_board_or_admin(v_org) THEN
    RAISE EXCEPTION 'next_journal_entry_number: not authorized' USING errcode = '42501';
  END IF;

  v_prefix := 'JE-' || p_year || '-';
  SELECT COALESCE(max(substring(entry_number FROM char_length(v_prefix) + 1)::integer), 0) INTO v_used
    FROM public.journal_entries
   WHERE association_id = p_association AND entry_number ~ ('^' || v_prefix || '[0-9]+$');
  INSERT INTO public.je_number_counters AS c (association_id, year, last_seq)
  VALUES (p_association, p_year, v_used + 1)
  ON CONFLICT (association_id, year)
  DO UPDATE SET last_seq = GREATEST(c.last_seq, v_used) + 1
  RETURNING last_seq INTO v_seq;
  RETURN v_prefix || lpad(v_seq::text, 5, '0');
END;
$fn$;

REVOKE ALL ON FUNCTION public.next_journal_entry_number(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_journal_entry_number(uuid, text) TO authenticated, service_role;

-- record_lump_payment: every part or nothing. parts is a JSON array of
--   {"assessment_id": "<uuid>", "cents": 12345}          a charge
--   {"kind": "credit", "cents": 500}                      unapplied credit (at most one)
-- A failure on any part raises, which rolls back every earlier part: the
-- function is one statement, so there is no half-posted state.
CREATE OR REPLACE FUNCTION public.record_lump_payment(
  p_org     uuid,
  p_unit    uuid,
  p_parts   jsonb,
  p_method  text,
  p_paid_on date,
  p_note    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid        uuid := auth.uid();
  v_assoc      uuid;
  v_part       jsonb;
  v_kind       text;
  v_aid        uuid;
  v_cents      bigint;
  v_ass        public.assessments%ROWTYPE;
  v_paid       numeric;
  v_left_cents bigint;
  v_seen       uuid[] := ARRAY[]::uuid[];
  v_credit_n   integer := 0;
  v_fund       uuid;
  v_cash       uuid;
  v_ar         uuid;
  v_prepaid    uuid;
  v_period     uuid;
  v_pay_id     uuid;
  v_credit_id  uuid;
  v_je_id      uuid;
  v_num        text;
  v_memo       text;
  v_payments   uuid[] := ARRAY[]::uuid[];
  v_jes        uuid[] := ARRAY[]::uuid[];
  v_applied    bigint := 0;
  v_credit     bigint := 0;
  v_paid_at    timestamptz;
BEGIN
  -- Replay re-grants EXECUTE on every routine to anon: the guard lives here.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'record_lump_payment: sign in first' USING errcode = '42501';
  END IF;
  IF p_org IS NULL OR NOT public.auth_is_board_or_admin(p_org) THEN
    RAISE EXCEPTION 'record_lump_payment: not authorized' USING errcode = '42501';
  END IF;

  IF p_unit IS NULL THEN
    RAISE EXCEPTION 'record_lump_payment: a home is required' USING errcode = '22023';
  END IF;
  SELECT u.association_id INTO v_assoc
    FROM public.units u
   WHERE u.id = p_unit AND u.organization_id = p_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'record_lump_payment: that home is not in this organization' USING errcode = '23503';
  END IF;

  IF p_method IS NULL OR p_method NOT IN ('ach', 'card', 'apple_pay', 'google_pay', 'zelle_assisted', 'check', 'cash', 'other') THEN
    RAISE EXCEPTION 'record_lump_payment: unknown payment method' USING errcode = '22023';
  END IF;
  IF p_paid_on IS NULL OR p_paid_on < DATE '2000-01-01' OR p_paid_on > (now() AT TIME ZONE 'UTC')::date + 1 THEN
    RAISE EXCEPTION 'record_lump_payment: the payment date is missing or in the future' USING errcode = '22023';
  END IF;
  IF p_note IS NOT NULL AND char_length(p_note) > 500 THEN
    RAISE EXCEPTION 'record_lump_payment: the note is too long' USING errcode = '22023';
  END IF;
  IF p_parts IS NULL OR jsonb_typeof(p_parts) <> 'array'
     OR jsonb_array_length(p_parts) < 1 OR jsonb_array_length(p_parts) > 200 THEN
    RAISE EXCEPTION 'record_lump_payment: parts must be a list of 1 to 200 entries' USING errcode = '22023';
  END IF;

  -- Noon UTC is the same calendar day in every US zone.
  v_paid_at := (p_paid_on::timestamp + interval '12 hours') AT TIME ZONE 'UTC';
  v_memo := 'Lump payment received' || CASE WHEN p_note IS NULL OR btrim(p_note) = '' THEN '' ELSE ': ' || left(btrim(p_note), 200) END;

  FOR v_part IN SELECT * FROM jsonb_array_elements(p_parts) LOOP
    IF jsonb_typeof(v_part) <> 'object' OR jsonb_typeof(v_part -> 'cents') IS DISTINCT FROM 'number'
       OR (v_part ->> 'cents') !~ '^[0-9]{1,10}$' THEN
      RAISE EXCEPTION 'record_lump_payment: every part needs whole cents' USING errcode = '22023';
    END IF;
    v_cents := (v_part ->> 'cents')::bigint;
    IF v_cents <= 0 THEN
      RAISE EXCEPTION 'record_lump_payment: every part must be more than zero' USING errcode = '22023';
    END IF;
    v_kind := COALESCE(v_part ->> 'kind', 'charge');

    IF v_kind = 'credit' THEN
      v_credit_n := v_credit_n + 1;
      IF v_credit_n > 1 THEN
        RAISE EXCEPTION 'record_lump_payment: at most one credit part' USING errcode = '22023';
      END IF;
      IF v_assoc IS NULL THEN
        RAISE EXCEPTION 'record_lump_payment: this home has no association' USING errcode = '23503';
      END IF;
      SELECT f.id INTO v_fund FROM public.funds f WHERE f.association_id = v_assoc AND f.code = 'OPERATING';
      SELECT c.id INTO v_cash FROM public.chart_of_accounts c WHERE c.association_id = v_assoc AND c.account_number = '1010';
      SELECT c.id INTO v_prepaid FROM public.chart_of_accounts c WHERE c.association_id = v_assoc AND c.account_number = '2100';
      SELECT c.id INTO v_ar FROM public.chart_of_accounts c WHERE c.association_id = v_assoc AND c.account_number = '1100';
      SELECT p.id INTO v_period FROM public.fiscal_periods p
       WHERE p.association_id = v_assoc AND p.status = 'open'
         AND p_paid_on BETWEEN p.start_date AND p.end_date
       ORDER BY p.start_date DESC LIMIT 1;
      IF v_fund IS NULL OR v_cash IS NULL OR COALESCE(v_prepaid, v_ar) IS NULL OR v_period IS NULL THEN
        RAISE EXCEPTION 'record_lump_payment: books_not_open' USING errcode = '55000';
      END IF;

      INSERT INTO public.unapplied_credits
        (organization_id, association_id, unit_id, amount, remaining, payment_method, received_on, note, created_by)
      VALUES
        (p_org, v_assoc, p_unit, v_cents / 100.0, v_cents / 100.0, p_method, p_paid_on, NULLIF(btrim(p_note), ''), v_uid)
      RETURNING id INTO v_credit_id;

      v_num := public.next_journal_entry_number(v_assoc, to_char(p_paid_on, 'YYYY'));
      INSERT INTO public.journal_entries
        (organization_id, association_id, fiscal_period_id, entry_number, entry_date, memo, source, source_id, status)
      VALUES
        (p_org, v_assoc, v_period, v_num, p_paid_on,
         v_memo || ' (unapplied credit)', 'ar_payment', v_credit_id, 'draft')
      RETURNING id INTO v_je_id;
      INSERT INTO public.ledger_entries (organization_id, journal_entry_id, account_id, fund_id, debit_amount, credit_amount)
      VALUES (p_org, v_je_id, v_cash, v_fund, v_cents / 100.0, 0),
             (p_org, v_je_id, COALESCE(v_prepaid, v_ar), v_fund, 0, v_cents / 100.0);
      UPDATE public.journal_entries SET status = 'posted', posted_at = now() WHERE id = v_je_id;
      UPDATE public.unapplied_credits SET journal_entry_id = v_je_id WHERE id = v_credit_id;

      v_jes := v_jes || v_je_id;
      v_credit := v_credit + v_cents;

    ELSIF v_kind = 'charge' THEN
      IF (v_part ->> 'assessment_id') IS NULL
         OR (v_part ->> 'assessment_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'record_lump_payment: a charge part needs an assessment_id' USING errcode = '22023';
      END IF;
      v_aid := (v_part ->> 'assessment_id')::uuid;
      IF v_aid = ANY (v_seen) THEN
        RAISE EXCEPTION 'record_lump_payment: a charge appears twice' USING errcode = '22023';
      END IF;
      v_seen := v_seen || v_aid;

      -- Lock the charge so two lump payments cannot both fill it.
      SELECT a.* INTO v_ass FROM public.assessments a WHERE a.id = v_aid FOR UPDATE;
      IF NOT FOUND OR v_ass.organization_id <> p_org OR v_ass.unit_id <> p_unit OR v_ass.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'record_lump_payment: a charge is not on this home' USING errcode = '23503';
      END IF;
      IF v_ass.status NOT IN ('open', 'partial') THEN
        RAISE EXCEPTION 'record_lump_payment: a charge is already settled' USING errcode = '22023';
      END IF;
      SELECT COALESCE(sum(pm.amount), 0) INTO v_paid FROM public.payments pm WHERE pm.assessment_id = v_aid;
      v_left_cents := round((v_ass.amount - v_paid) * 100)::bigint;
      IF v_cents > v_left_cents THEN
        RAISE EXCEPTION 'record_lump_payment: more than a charge has left (over-application)' USING errcode = '23514';
      END IF;

      SELECT f.id INTO v_fund FROM public.funds f WHERE f.association_id = v_ass.association_id AND f.code = 'OPERATING';
      SELECT c.id INTO v_cash FROM public.chart_of_accounts c WHERE c.association_id = v_ass.association_id AND c.account_number = '1010';
      SELECT c.id INTO v_ar FROM public.chart_of_accounts c WHERE c.association_id = v_ass.association_id AND c.account_number = '1100';
      IF v_fund IS NULL OR v_cash IS NULL OR v_ar IS NULL THEN
        RAISE EXCEPTION 'record_lump_payment: books_not_open' USING errcode = '55000';
      END IF;

      INSERT INTO public.payments (organization_id, unit_id, assessment_id, amount, payment_method, paid_at)
      VALUES (p_org, p_unit, v_aid, v_cents / 100.0, p_method, v_paid_at)
      RETURNING id INTO v_pay_id;

      v_num := public.next_journal_entry_number(v_ass.association_id, to_char(p_paid_on, 'YYYY'));
      INSERT INTO public.journal_entries
        (organization_id, association_id, fiscal_period_id, entry_number, entry_date, memo, source, source_id, status)
      VALUES
        (p_org, v_ass.association_id, v_ass.fiscal_period_id, v_num, p_paid_on,
         v_memo, 'ar_payment', v_pay_id, 'draft')
      RETURNING id INTO v_je_id;
      INSERT INTO public.ledger_entries (organization_id, journal_entry_id, account_id, fund_id, debit_amount, credit_amount)
      VALUES (p_org, v_je_id, v_cash, v_fund, v_cents / 100.0, 0),
             (p_org, v_je_id, v_ar,   v_fund, 0, v_cents / 100.0);
      UPDATE public.journal_entries SET status = 'posted', posted_at = now() WHERE id = v_je_id;
      UPDATE public.payments SET journal_entry_id = v_je_id WHERE id = v_pay_id;

      UPDATE public.assessments
         SET status = CASE WHEN round((v_paid + v_cents / 100.0) * 100) >= round(v_ass.amount * 100) THEN 'paid' ELSE 'partial' END
       WHERE id = v_aid;

      v_payments := v_payments || v_pay_id;
      v_jes := v_jes || v_je_id;
      v_applied := v_applied + v_cents;

    ELSE
      RAISE EXCEPTION 'record_lump_payment: unknown part kind' USING errcode = '22023';
    END IF;
  END LOOP;

  -- Ids and cents only: no names, addresses or the note.
  INSERT INTO public.audit_log (org_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (p_org, v_uid, 'payment.lump_posted', 'unit', p_unit,
          jsonb_build_object('method', p_method, 'applied_cents', v_applied, 'credit_cents', v_credit,
                             'payment_ids', to_jsonb(v_payments), 'credit_id', v_credit_id));

  RETURN jsonb_build_object(
    'payment_ids', to_jsonb(v_payments),
    'credit_id', v_credit_id,
    'journal_entry_ids', to_jsonb(v_jes),
    'applied_cents', v_applied,
    'credit_cents', v_credit
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.record_lump_payment(uuid, uuid, jsonb, text, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_lump_payment(uuid, uuid, jsonb, text, date, text) TO authenticated, service_role;


-- apply_unapplied_credit: the board puts some or all of a home's unapplied credit
-- against one of its open charges, in one transaction. Same guards as
-- record_lump_payment. The money is already in the books (cash in, Prepaid
-- Assessments out); applying moves it from Prepaid Assessments to Accounts
-- Receivable, so the entry is debit Prepaid / credit AR. A credit that was booked
-- straight to AR (a chart with no 2100) needs no entry. Over-application of the
-- credit or of the charge is refused (23514).
CREATE OR REPLACE FUNCTION public.apply_unapplied_credit(
  p_org        uuid,
  p_credit     uuid,
  p_assessment uuid,
  p_cents      bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid        uuid := auth.uid();
  v_cr         public.unapplied_credits%ROWTYPE;
  v_ass        public.assessments%ROWTYPE;
  v_paid       numeric;
  v_left_cents bigint;
  v_fund       uuid;
  v_ar         uuid;
  v_src        uuid;
  v_pay_id     uuid;
  v_je_id      uuid;
  v_num        text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'apply_unapplied_credit: sign in first' USING errcode = '42501';
  END IF;
  IF p_org IS NULL OR NOT public.auth_is_board_or_admin(p_org) THEN
    RAISE EXCEPTION 'apply_unapplied_credit: not authorized' USING errcode = '42501';
  END IF;
  IF p_cents IS NULL OR p_cents <= 0 THEN
    RAISE EXCEPTION 'apply_unapplied_credit: the amount must be more than zero' USING errcode = '22023';
  END IF;

  SELECT c.* INTO v_cr FROM public.unapplied_credits c WHERE c.id = p_credit FOR UPDATE;
  IF NOT FOUND OR v_cr.organization_id <> p_org THEN
    RAISE EXCEPTION 'apply_unapplied_credit: that credit is not in this organization' USING errcode = '23503';
  END IF;
  SELECT a.* INTO v_ass FROM public.assessments a WHERE a.id = p_assessment FOR UPDATE;
  IF NOT FOUND OR v_ass.organization_id <> p_org OR v_ass.unit_id <> v_cr.unit_id OR v_ass.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'apply_unapplied_credit: that charge is not on the credit''s home' USING errcode = '23503';
  END IF;
  IF v_ass.status NOT IN ('open', 'partial') THEN
    RAISE EXCEPTION 'apply_unapplied_credit: that charge is already settled' USING errcode = '22023';
  END IF;
  IF p_cents > round(v_cr.remaining * 100)::bigint THEN
    RAISE EXCEPTION 'apply_unapplied_credit: more than the credit has left (over-application)' USING errcode = '23514';
  END IF;
  SELECT COALESCE(sum(pm.amount), 0) INTO v_paid FROM public.payments pm WHERE pm.assessment_id = p_assessment;
  v_left_cents := round((v_ass.amount - v_paid) * 100)::bigint;
  IF p_cents > v_left_cents THEN
    RAISE EXCEPTION 'apply_unapplied_credit: more than the charge has left (over-application)' USING errcode = '23514';
  END IF;

  SELECT f.id INTO v_fund FROM public.funds f WHERE f.association_id = v_ass.association_id AND f.code = 'OPERATING';
  SELECT c.id INTO v_ar FROM public.chart_of_accounts c WHERE c.association_id = v_ass.association_id AND c.account_number = '1100';
  IF v_fund IS NULL OR v_ar IS NULL THEN
    RAISE EXCEPTION 'apply_unapplied_credit: books_not_open' USING errcode = '55000';
  END IF;

  INSERT INTO public.payments (organization_id, unit_id, assessment_id, amount, payment_method, paid_at)
  VALUES (p_org, v_cr.unit_id, p_assessment, p_cents / 100.0, v_cr.payment_method, now())
  RETURNING id INTO v_pay_id;

  -- Which account holds the credit today: the credit side of its entry.
  SELECT l.account_id INTO v_src
    FROM public.ledger_entries l
   WHERE l.journal_entry_id = v_cr.journal_entry_id AND l.credit_amount > 0
   LIMIT 1;
  IF v_src IS NOT NULL AND v_src <> v_ar THEN
    v_num := public.next_journal_entry_number(v_ass.association_id, to_char((now() AT TIME ZONE 'UTC')::date, 'YYYY'));
    INSERT INTO public.journal_entries
      (organization_id, association_id, fiscal_period_id, entry_number, entry_date, memo, source, source_id, status)
    VALUES
      (p_org, v_ass.association_id, v_ass.fiscal_period_id, v_num, (now() AT TIME ZONE 'UTC')::date,
       'Unapplied credit applied to a charge', 'ar_payment', v_pay_id, 'draft')
    RETURNING id INTO v_je_id;
    INSERT INTO public.ledger_entries (organization_id, journal_entry_id, account_id, fund_id, debit_amount, credit_amount)
    VALUES (p_org, v_je_id, v_src, v_fund, p_cents / 100.0, 0),
           (p_org, v_je_id, v_ar,  v_fund, 0, p_cents / 100.0);
    UPDATE public.journal_entries SET status = 'posted', posted_at = now() WHERE id = v_je_id;
    UPDATE public.payments SET journal_entry_id = v_je_id WHERE id = v_pay_id;
  ELSE
    UPDATE public.payments SET journal_entry_id = v_cr.journal_entry_id WHERE id = v_pay_id;
  END IF;

  UPDATE public.unapplied_credits SET remaining = remaining - p_cents / 100.0 WHERE id = p_credit;
  UPDATE public.assessments
     SET status = CASE WHEN round((v_paid + p_cents / 100.0) * 100) >= round(v_ass.amount * 100) THEN 'paid' ELSE 'partial' END
   WHERE id = p_assessment;

  INSERT INTO public.audit_log (org_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (p_org, v_uid, 'payment.credit_applied', 'unit', v_cr.unit_id,
          jsonb_build_object('credit_id', p_credit, 'assessment_id', p_assessment, 'cents', p_cents, 'payment_id', v_pay_id));

  RETURN jsonb_build_object('payment_id', v_pay_id, 'journal_entry_id', v_je_id, 'cents', p_cents);
END;
$fn$;

REVOKE ALL ON FUNCTION public.apply_unapplied_credit(uuid, uuid, uuid, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_unapplied_credit(uuid, uuid, uuid, bigint) TO authenticated, service_role;

-- ── 3. BL-176: state / governing-law state / type are admin-only ───────
-- SECURITY INVOKER on purpose: current_user is the PostgREST role. The
-- service role and the migration owner pass (they have no end user); a
-- signed-in user must be an admin of the row's organization (the old one
-- too, so a row cannot be edited on the way out of an org).
CREATE OR REPLACE FUNCTION public.associations_state_type_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF new.state IS NOT DISTINCT FROM old.state
     AND new.governing_law_state IS NOT DISTINCT FROM old.governing_law_state
     AND new.type IS NOT DISTINCT FROM old.type THEN
    RETURN new;
  END IF;
  IF current_user IN ('authenticated', 'anon')
     AND (auth.uid() IS NULL
          OR NOT public.auth_is_admin(old.organization_id)
          OR NOT public.auth_is_admin(new.organization_id)) THEN
    RAISE EXCEPTION 'associations: only an admin changes the state, governing-law state or type'
      USING errcode = '42501';
  END IF;
  RETURN new;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.associations_state_type_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS associations_state_type_guard ON public.associations;
CREATE TRIGGER associations_state_type_guard
  BEFORE UPDATE OF state, governing_law_state, type ON public.associations
  FOR EACH ROW EXECUTE FUNCTION public.associations_state_type_guard();

-- ── post-checks (raise and roll everything back) ───────────────────────
DO $post$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'collection_events'
     AND column_name IN ('mail_method', 'tracking_number', 'mailed_on', 'delivered_on', 'delivery_for_event_id')
     AND is_nullable = 'YES';
  IF n <> 5 THEN
    RAISE EXCEPTION '0072: expected 5 nullable mail columns on collection_events, found %', n;
  END IF;
  -- The trail stays append-only: the existing rules cover the new columns
  -- because they are row rules, but an UPDATE or DELETE policy would let
  -- the new columns (and everything else) be edited.
  IF EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname = 'public' AND tablename = 'collection_events'
                AND cmd IN ('UPDATE', 'DELETE', 'ALL')) THEN
    RAISE EXCEPTION '0072: collection_events has an UPDATE / DELETE / ALL policy; it must stay append-only';
  END IF;
  IF (SELECT count(*) FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'collection_events'
         AND policyname IN ('board_read', 'board_insert')) <> 2 THEN
    RAISE EXCEPTION '0072: collection_events lost board_read / board_insert';
  END IF;
  SELECT count(*) INTO n FROM pg_trigger tg
   WHERE NOT tg.tgisinternal AND tg.tgrelid = 'public.unapplied_credits'::regclass
     AND tg.tgfoid = 'public.tenant_fk_same_org()'::regprocedure;
  IF n <> 3 THEN
    RAISE EXCEPTION '0072: expected 3 same-org triggers on unapplied_credits, found %', n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.collection_events'::regclass AND tgname = 'zz_org_fk_collection_events_delivery_for_event_id') THEN
    RAISE EXCEPTION '0072: collection_events lost its same-org trigger on delivery_for_event_id';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.unapplied_credits'::regclass) THEN
    RAISE EXCEPTION '0072: unapplied_credits has no row level security';
  END IF;
  IF NOT (coalesce((SELECT proconfig FROM pg_proc
                     WHERE oid = 'public.record_lump_payment(uuid, uuid, jsonb, text, date, text)'::regprocedure), '{}')
          @> ARRAY['search_path=public, pg_temp']) THEN
    RAISE EXCEPTION '0072: record_lump_payment has no pinned search_path';
  END IF;
  IF has_function_privilege('anon', 'public.record_lump_payment(uuid, uuid, jsonb, text, date, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.apply_unapplied_credit(uuid, uuid, uuid, bigint)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.next_journal_entry_number(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION '0072: anon can execute a new function';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
              AND p.proname IN ('record_lump_payment', 'apply_unapplied_credit', 'next_journal_entry_number')
              AND NOT (coalesce(p.proconfig, '{}') @> ARRAY['search_path=public, pg_temp'])) THEN
    RAISE EXCEPTION '0072: a new function has no pinned search_path';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.associations'::regclass AND tgname = 'associations_state_type_guard') THEN
    RAISE EXCEPTION '0072: associations_state_type_guard is missing';
  END IF;
  RAISE NOTICE '0072 ok: M7 applied (mail tracking, lump payments + credit, admin-only state/type).';
END $post$;

COMMIT;
