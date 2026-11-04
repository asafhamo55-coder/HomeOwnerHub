-- 0082_money_integrity.sql: money-integrity backstops from the 2026-11-02 security audit
--
-- Needs 0006, 0061, 0072 and 0073, all asserted below. Every statement is
-- idempotent (CREATE OR REPLACE, DROP ... IF EXISTS, ADD CONSTRAINT after DROP);
-- any failed assertion raises and rolls the whole file back. It runs AFTER 0081.
-- Do not edit 0073: reverse_online_payment is replaced here.
--
-- WHAT THIS DOES
--
--   1. Closed-period backstop. BEFORE INSERT OR UPDATE triggers on journal_entries
--      and on assessments (due_date, amount, association, period) raise
--      'closed_period' (ERRCODE 55000) when the row falls in a fiscal_periods row
--      with status 'closed' for the same association, by date OR by
--      fiscal_period_id. It mirrors packages/db/src/accounting/period-guard.ts,
--      which is the application guard; this is the backstop behind it.
--        * Closing entries: closePeriod flips the period to 'closing' first and
--          posts its source = 'closing' entries into it, so they pass (only
--          'closed' blocks), exactly like the app guard.
--        * Money that already moved: record_online_payment_success and
--          reverse_online_payment (both re-created here, bodies unchanged apart from
--          refund_failed) set the transaction-local setting app.money_already_moved
--          to 'on' around their writes and back to 'off' before returning. The
--          triggers skip the check only when it is on AND the JWT role is
--          service_role. Nothing a web client sends can set it.
--   2. Posted ledger rows are immutable through the REST API. For the roles
--      authenticated and anon (current_user, so SECURITY DEFINER functions such
--      as record_lump_payment and the service role are untouched):
--        * journal_entries: INSERT only as 'draft'; DELETE only a draft; UPDATE of
--          a posted or reversed row may change exactly status (posted -> reversed),
--          reversed_by_id and reverses_id (each only from NULL). That is what the
--          app does (journal-entries.ts, payment-plans/create.ts). A draft can be
--          edited and flipped to 'posted'.
--        * ledger_entries (the lines): no INSERT, UPDATE or DELETE once the parent
--          entry is not a draft.
--   3. Buyer reads the seller's credits. unapplied_credits_resident_select (0072)
--      now also requires resident_credit_in_window(unit_id, received_on): a current
--      ownership that began with a recorded sale (source 'sale') hides credits
--      received before its valid_from. Same rule as chargesFromForOwnership /
--      scopeCredits in apps/hoa/src/lib/resident-sale-window.ts: any other ownership
--      (import, invite, manual) keeps the whole unit history.
--   4. refund_failed. online_payment_adjustments.kind accepts 'refund_failed', and
--      reverse_online_payment(p_attempt, 'refund_failed', <the re_ id of the refund
--      that failed>) books the original refund's reversing entries back (a new
--      payments row and entry per part, credit remaining restored, assessment status
--      recomputed), once per (attempt, kind, ref). A refund the books never took, or
--      one with no matching 'refund' adjustment, raises 55000.

BEGIN;

DO $pre$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['journal_entries', 'ledger_entries', 'fiscal_periods', 'assessments',
                           'payments', 'unapplied_credits', 'ownerships',
                           'online_payments', 'online_payment_adjustments'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION '0082: public.% is missing (apply 0073 first)', t;
    END IF;
  END LOOP;
  IF to_regprocedure('public.reverse_online_payment(uuid,text,text,bigint,text,date,integer,uuid)') IS NULL
     OR to_regprocedure('public.record_online_payment_success(uuid,date,text)') IS NULL THEN
    RAISE EXCEPTION '0082: apply 0073 first (online payment functions missing)';
  END IF;
  IF to_regprocedure('public.auth_resident_unit_ids()') IS NULL
     OR to_regprocedure('public.auth_org_ids()') IS NULL THEN
    RAISE EXCEPTION '0082: auth helpers missing';
  END IF;
END $pre$;

-- 1. closed-period backstop -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.money_already_moved()
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE(current_setting('app.money_already_moved', true), '') = 'on'
     AND COALESCE(auth.role(), '') = 'service_role';
$fn$;

CREATE OR REPLACE FUNCTION public.money_period_is_closed(p_association uuid, p_period uuid, p_date date)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.fiscal_periods p
     WHERE p.association_id = p_association
       AND p.status = 'closed'
       AND ((p_period IS NOT NULL AND p.id = p_period)
            OR (p_date IS NOT NULL AND p_date BETWEEN p.start_date AND p.end_date))
  );
$fn$;

CREATE OR REPLACE FUNCTION public.journal_entries_closed_period_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF public.money_already_moved() THEN
    RETURN NEW;
  END IF;
  IF public.money_period_is_closed(NEW.association_id, NEW.fiscal_period_id, NEW.entry_date)
     OR (TG_OP = 'UPDATE'
         AND public.money_period_is_closed(OLD.association_id, OLD.fiscal_period_id, OLD.entry_date)) THEN
    RAISE EXCEPTION 'closed_period' USING ERRCODE = '55000',
      DETAIL = 'That date is in a closed month. Reopen the month or use today''s date.';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS journal_entries_closed_period_guard ON public.journal_entries;
CREATE TRIGGER journal_entries_closed_period_guard
  BEFORE INSERT OR UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.journal_entries_closed_period_guard();

CREATE OR REPLACE FUNCTION public.assessments_closed_period_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF public.money_already_moved() THEN
    RETURN NEW;
  END IF;
  IF public.money_period_is_closed(NEW.association_id, NEW.fiscal_period_id, NEW.due_date)
     OR (TG_OP = 'UPDATE'
         AND public.money_period_is_closed(OLD.association_id, OLD.fiscal_period_id, OLD.due_date)) THEN
    RAISE EXCEPTION 'closed_period' USING ERRCODE = '55000',
      DETAIL = 'That date is in a closed month. Reopen the month or use today''s date.';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS assessments_closed_period_guard ON public.assessments;
CREATE TRIGGER assessments_closed_period_guard
  BEFORE INSERT OR UPDATE OF due_date, amount, association_id, fiscal_period_id ON public.assessments
  FOR EACH ROW EXECUTE FUNCTION public.assessments_closed_period_guard();

-- 2. posted ledger rows are immutable through the REST API ------------------------
CREATE OR REPLACE FUNCTION public.journal_entries_posted_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  -- Only the web roles. SECURITY DEFINER functions run as their owner and the
  -- service role as service_role, so neither is touched.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'posted_immutable' USING ERRCODE = '55000',
        DETAIL = 'An entry is created as a draft and then posted.';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'posted_immutable' USING ERRCODE = '55000',
        DETAIL = 'A posted entry cannot be deleted. Reverse it instead.';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE
  IF OLD.status = 'draft' THEN
    IF NEW.status = 'reversed' THEN
      RAISE EXCEPTION 'posted_immutable' USING ERRCODE = '55000',
        DETAIL = 'Only a posted entry can be reversed.';
    END IF;
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - 'status' - 'reversed_by_id' - 'reverses_id')
     IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'reversed_by_id' - 'reverses_id')
     OR (NEW.status IS DISTINCT FROM OLD.status AND NOT (OLD.status = 'posted' AND NEW.status = 'reversed'))
     OR (OLD.reversed_by_id IS NOT NULL AND NEW.reversed_by_id IS DISTINCT FROM OLD.reversed_by_id)
     OR (OLD.reverses_id IS NOT NULL AND NEW.reverses_id IS DISTINCT FROM OLD.reverses_id) THEN
    RAISE EXCEPTION 'posted_immutable' USING ERRCODE = '55000',
      DETAIL = 'A posted entry cannot be edited. Reverse it instead.';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS journal_entries_posted_immutable ON public.journal_entries;
CREATE TRIGGER journal_entries_posted_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.journal_entries_posted_immutable();

-- Reads the parent's status without the caller's row level security.
CREATE OR REPLACE FUNCTION public.journal_entry_is_posted(p_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE((SELECT je.status <> 'draft' FROM public.journal_entries je WHERE je.id = p_id), false);
$fn$;

CREATE OR REPLACE FUNCTION public.ledger_entries_posted_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF (TG_OP IN ('UPDATE', 'DELETE') AND public.journal_entry_is_posted(OLD.journal_entry_id))
     OR (TG_OP IN ('INSERT', 'UPDATE') AND public.journal_entry_is_posted(NEW.journal_entry_id)) THEN
    RAISE EXCEPTION 'posted_immutable' USING ERRCODE = '55000',
      DETAIL = 'The lines of a posted entry cannot be changed. Reverse the entry instead.';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$fn$;

DROP TRIGGER IF EXISTS ledger_entries_posted_immutable ON public.ledger_entries;
CREATE TRIGGER ledger_entries_posted_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.ledger_entries_posted_immutable();

-- 3. a buyer does not read the seller's unapplied credits ----------------------------
CREATE OR REPLACE FUNCTION public.resident_credit_in_window(p_unit uuid, p_received_on date)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.ownerships o
     WHERE o.owner_user_id = auth.uid()
       AND o.unit_id = p_unit
       AND o.valid_to IS NULL
       AND o.source = 'sale'
       AND p_received_on < o.valid_from
  );
$fn$;
REVOKE ALL ON FUNCTION public.resident_credit_in_window(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resident_credit_in_window(uuid, date) TO authenticated, service_role;

DROP POLICY IF EXISTS unapplied_credits_resident_select ON public.unapplied_credits;
CREATE POLICY unapplied_credits_resident_select ON public.unapplied_credits
  FOR SELECT TO authenticated
  USING (organization_id = ANY (public.auth_org_ids())
         AND unit_id = ANY ((SELECT public.auth_resident_unit_ids())::uuid[])
         AND public.resident_credit_in_window(unit_id, received_on));

-- 4. refund_failed ---------------------------------------------------------------------
ALTER TABLE public.online_payment_adjustments DROP CONSTRAINT IF EXISTS online_payment_adjustments_kind_check;
ALTER TABLE public.online_payment_adjustments ADD CONSTRAINT online_payment_adjustments_kind_check
  CHECK (kind IN ('failed', 'refund', 'dispute_lost', 'dispute_won', 'returned_fee', 'refund_failed'));

CREATE OR REPLACE FUNCTION public.reverse_online_payment(
  p_attempt uuid,
  p_kind    text,
  p_ref     text,
  p_cents   bigint DEFAULT NULL,
  p_reason  text DEFAULT NULL,
  p_on      date DEFAULT NULL,
  p_returned_fee_cents integer DEFAULT 0,
  p_by      uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_op         public.online_payments%ROWTYPE;
  v_on         date := COALESCE(p_on, (now() AT TIME ZONE 'UTC')::date);
  v_want       bigint;
  v_done       bigint := 0;
  v_short      bigint := 0;
  v_part       jsonb;
  v_take       bigint;
  v_cents      bigint;
  v_ass        public.assessments%ROWTYPE;
  v_paid       numeric;
  v_cr         public.unapplied_credits%ROWTYPE;
  v_fund       uuid;
  v_clearing   uuid;
  v_cash       uuid;
  v_ar         uuid;
  v_prepaid    uuid;
  v_pay_id     uuid;
  v_je_id      uuid;
  v_num        text;
  v_jes        uuid[] := ARRAY[]::uuid[];
  v_adj_id     uuid;
  v_fee_id     uuid;
  v_period     uuid;
  v_new_status text;
  v_posted_total bigint;
  v_reversed_before bigint;
  v_orig       public.online_payment_adjustments%ROWTYPE;
  v_old_je     uuid;
  v_old_src    uuid;
  v_aid        uuid;
  v_amt        numeric;
  v_net        bigint;
  v_restored   bigint := 0;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'reverse_online_payment: service role only' USING errcode = '42501';
  END IF;
  IF p_kind NOT IN ('failed', 'refund', 'dispute_lost', 'dispute_won', 'refund_failed') THEN
    RAISE EXCEPTION 'reverse_online_payment: unknown kind' USING errcode = '22023';
  END IF;
  IF p_ref IS NULL OR char_length(p_ref) NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION 'reverse_online_payment: a Stripe reference is required' USING errcode = '22023';
  END IF;

  SELECT * INTO v_op FROM public.online_payments WHERE id = p_attempt FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reverse_online_payment: unknown attempt' USING errcode = '23503';
  END IF;

  -- Replay.
  IF EXISTS (SELECT 1 FROM public.online_payment_adjustments
              WHERE online_payment_id = p_attempt AND kind = p_kind AND stripe_ref = p_ref) THEN
    RETURN jsonb_build_object('already_applied', true, 'status', v_op.status);
  END IF;

  -- Failed or lost before it was ever posted: nothing to reverse.
  IF v_op.posted_at IS NULL THEN
    IF p_kind <> 'failed' THEN
      RAISE EXCEPTION 'reverse_online_payment: % on an unposted attempt', p_kind USING errcode = '55000';
    END IF;
    UPDATE public.online_payments
       SET status = 'failed', failure_code = left(COALESCE(p_reason, 'failed'), 120)
     WHERE id = p_attempt AND status NOT IN ('succeeded');
    INSERT INTO public.online_payment_adjustments
      (organization_id, association_id, online_payment_id, kind, stripe_ref, amount_cents, reason, created_by)
    VALUES (v_op.organization_id, v_op.association_id, p_attempt, 'failed', p_ref, 0, left(p_reason, 300), p_by);
    INSERT INTO public.audit_log (org_id, user_id, action, entity_type, entity_id, metadata)
    VALUES (v_op.organization_id, p_by, 'online_payment.failed_unposted', 'online_payment', v_op.id,
            jsonb_build_object('method', v_op.method_type, 'dues_cents', v_op.dues_cents));
    RETURN jsonb_build_object('already_applied', false, 'status', 'failed', 'reversed_cents', 0);
  END IF;

  IF p_kind = 'dispute_won' THEN
    UPDATE public.online_payments SET status = 'succeeded' WHERE id = p_attempt AND status = 'disputed';
    INSERT INTO public.online_payment_adjustments
      (organization_id, association_id, online_payment_id, kind, stripe_ref, amount_cents, reason, created_by)
    VALUES (v_op.organization_id, v_op.association_id, p_attempt, 'dispute_won', p_ref, 0, left(p_reason, 300), p_by);
    RETURN jsonb_build_object('already_applied', false, 'status', 'succeeded', 'reversed_cents', 0);
  END IF;

  -- refund_failed: a refund the books already took (kind 'refund', same Stripe ref)
  -- failed later at Stripe. Book exactly that refund's reversing entries back, once.
  IF p_kind = 'refund_failed' THEN
    SELECT * INTO v_orig FROM public.online_payment_adjustments
     WHERE online_payment_id = p_attempt AND kind = 'refund' AND stripe_ref = p_ref;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'reverse_online_payment: refund_failed for a refund the books never took' USING errcode = '55000';
    END IF;

    SELECT f.id INTO v_fund FROM public.funds f WHERE f.association_id = v_op.association_id AND f.code = 'OPERATING';
    SELECT c.id INTO v_cash FROM public.chart_of_accounts c WHERE c.association_id = v_op.association_id AND c.account_number = '1010';
    SELECT c.id INTO v_clearing FROM public.chart_of_accounts c WHERE c.association_id = v_op.association_id AND c.account_number = '1015' AND c.is_active;
    SELECT c.id INTO v_ar FROM public.chart_of_accounts c WHERE c.association_id = v_op.association_id AND c.account_number = '1100';
    SELECT c.id INTO v_prepaid FROM public.chart_of_accounts c WHERE c.association_id = v_op.association_id AND c.account_number = '2100';
    v_clearing := COALESCE(v_clearing, v_cash);
    IF v_fund IS NULL OR v_clearing IS NULL OR v_ar IS NULL THEN
      RAISE EXCEPTION 'reverse_online_payment: books_not_open' USING errcode = '55000';
    END IF;
    SELECT p.id INTO v_period FROM public.fiscal_periods p
     WHERE p.association_id = v_op.association_id AND p.status = 'open' AND v_on BETWEEN p.start_date AND p.end_date
     ORDER BY p.start_date DESC LIMIT 1;
    IF v_period IS NULL THEN
      RAISE EXCEPTION 'reverse_online_payment: books_not_open' USING errcode = '55000';
    END IF;

    PERFORM set_config('app.money_already_moved', 'on', true);
    FOREACH v_old_je IN ARRAY v_orig.journal_entry_ids LOOP
      SELECT je.source_id INTO v_old_src FROM public.journal_entries je WHERE je.id = v_old_je;
      SELECT COALESCE(sum(l.debit_amount), 0) INTO v_amt FROM public.ledger_entries l WHERE l.journal_entry_id = v_old_je;
      v_take := round(v_amt * 100)::bigint;
      IF v_take <= 0 THEN CONTINUE; END IF;
      v_num := public.next_journal_entry_number(v_op.association_id, to_char(v_on, 'YYYY'));

      SELECT * INTO v_cr FROM public.unapplied_credits WHERE id = v_old_src FOR UPDATE;
      IF FOUND THEN
        -- The refund took this part out of an unapplied credit: give it back.
        UPDATE public.unapplied_credits
           SET remaining = LEAST(amount, remaining + v_take / 100.0) WHERE id = v_cr.id;
        INSERT INTO public.journal_entries
          (organization_id, association_id, fiscal_period_id, entry_number, entry_date, memo, source, source_id, status)
        VALUES (v_op.organization_id, v_op.association_id, v_period, v_num, v_on,
                'Failed refund restored (credit)', 'reversing', v_cr.id, 'draft')
        RETURNING id INTO v_je_id;
        INSERT INTO public.ledger_entries (organization_id, journal_entry_id, account_id, fund_id, debit_amount, credit_amount)
        VALUES (v_op.organization_id, v_je_id, v_clearing,                v_fund, v_take / 100.0, 0),
               (v_op.organization_id, v_je_id, COALESCE(v_prepaid, v_ar), v_fund, 0, v_take / 100.0);
        UPDATE public.journal_entries SET status = 'posted', posted_at = now() WHERE id = v_je_id;
      ELSE
        v_aid := NULL;
        SELECT pm.assessment_id INTO v_aid FROM public.payments pm WHERE pm.id = v_old_src;
        IF v_aid IS NULL THEN CONTINUE; END IF;
        SELECT a.* INTO v_ass FROM public.assessments a WHERE a.id = v_aid FOR UPDATE;
        IF NOT FOUND THEN CONTINUE; END IF;
        INSERT INTO public.payments (organization_id, unit_id, assessment_id, amount, payment_method, external_ref, paid_at)
        VALUES (v_op.organization_id, v_op.unit_id, v_ass.id, v_take / 100.0, v_op.method_type,
                'refund_failed:' || p_ref, (v_on::timestamp + interval '12 hours') AT TIME ZONE 'UTC')
        RETURNING id INTO v_pay_id;
        INSERT INTO public.journal_entries
          (organization_id, association_id, fiscal_period_id, entry_number, entry_date, memo, source, source_id, status)
        VALUES (v_op.organization_id, v_ass.association_id, v_period, v_num, v_on,
                'Failed refund restored', 'reversing', v_pay_id, 'draft')
        RETURNING id INTO v_je_id;
        INSERT INTO public.ledger_entries (organization_id, journal_entry_id, account_id, fund_id, debit_amount, credit_amount)
        VALUES (v_op.organization_id, v_je_id, v_clearing, v_fund, v_take / 100.0, 0),
               (v_op.organization_id, v_je_id, v_ar,       v_fund, 0, v_take / 100.0);
        UPDATE public.journal_entries SET status = 'posted', posted_at = now() WHERE id = v_je_id;
        UPDATE public.payments SET journal_entry_id = v_je_id WHERE id = v_pay_id;

        SELECT COALESCE(sum(pm.amount), 0) INTO v_paid FROM public.payments pm WHERE pm.assessment_id = v_ass.id;
        UPDATE public.assessments
           SET status = CASE WHEN round(v_paid * 100) >= round(v_ass.amount * 100) THEN 'paid'
                             WHEN round(v_paid * 100) > 0 THEN 'partial'
                             ELSE 'open' END
         WHERE id = v_ass.id AND status IN ('open', 'partial', 'paid');
      END IF;
      v_jes := v_jes || v_je_id;
      v_restored := v_restored + v_take;
    END LOOP;

    INSERT INTO public.online_payment_adjustments
      (organization_id, association_id, online_payment_id, kind, stripe_ref, amount_cents, reason, journal_entry_ids, created_by)
    VALUES (v_op.organization_id, v_op.association_id, p_attempt, 'refund_failed', p_ref, v_restored,
            left(COALESCE(p_reason, 'Refund failed'), 300), v_jes, p_by)
    RETURNING id INTO v_adj_id;

    SELECT COALESCE(sum((e ->> 'cents')::bigint), 0) INTO v_posted_total
      FROM jsonb_array_elements(v_op.posted_result) e;
    SELECT COALESCE(sum(CASE WHEN a.kind = 'refund_failed' THEN -a.amount_cents ELSE a.amount_cents END), 0) INTO v_net
      FROM public.online_payment_adjustments a
     WHERE a.online_payment_id = p_attempt AND a.kind IN ('failed', 'refund', 'dispute_lost', 'refund_failed');
    v_new_status := CASE WHEN v_net <= 0 THEN 'succeeded'
                         WHEN v_net >= v_posted_total THEN 'refunded'
                         ELSE 'partially_refunded' END;
    UPDATE public.online_payments SET status = v_new_status
     WHERE id = p_attempt AND status IN ('partially_refunded', 'refunded');

    INSERT INTO public.audit_log (org_id, user_id, action, entity_type, entity_id, metadata)
    VALUES (v_op.organization_id, p_by, 'online_payment.refund_failed', 'online_payment', v_op.id,
            jsonb_build_object('method', v_op.method_type, 'restored_cents', v_restored));

    PERFORM set_config('app.money_already_moved', 'off', true);
    RETURN jsonb_build_object('already_applied', false, 'status', COALESCE((SELECT status FROM public.online_payments WHERE id = p_attempt), v_new_status),
                              'restored_cents', v_restored, 'reversed_cents', 0, 'adjustment_id', v_adj_id);
  END IF;

  -- What was posted, and what has already been reversed.
  SELECT COALESCE(sum((e ->> 'cents')::bigint), 0) INTO v_posted_total
    FROM jsonb_array_elements(v_op.posted_result) e;
  SELECT COALESCE(sum(CASE WHEN a.kind = 'refund_failed' THEN -a.amount_cents ELSE a.amount_cents END), 0)
    INTO v_reversed_before
    FROM public.online_payment_adjustments a
   WHERE a.online_payment_id = p_attempt AND a.kind IN ('failed', 'refund', 'dispute_lost', 'refund_failed');
  IF v_reversed_before >= v_posted_total THEN
    RAISE EXCEPTION 'reverse_online_payment: already fully reversed' USING errcode = '55000';
  END IF;

  v_want := CASE WHEN p_kind = 'refund' AND p_cents IS NOT NULL THEN p_cents
                 ELSE v_posted_total - v_reversed_before END;
  IF v_want <= 0 OR v_want > v_posted_total - v_reversed_before THEN
    RAISE EXCEPTION 'reverse_online_payment: amount is more than what is left to reverse' USING errcode = '23514';
  END IF;

  PERFORM set_config('app.money_already_moved', 'on', true);
  SELECT f.id INTO v_fund FROM public.funds f WHERE f.association_id = v_op.association_id AND f.code = 'OPERATING';
  SELECT c.id INTO v_cash FROM public.chart_of_accounts c WHERE c.association_id = v_op.association_id AND c.account_number = '1010';
  SELECT c.id INTO v_clearing FROM public.chart_of_accounts c WHERE c.association_id = v_op.association_id AND c.account_number = '1015' AND c.is_active;
  SELECT c.id INTO v_ar FROM public.chart_of_accounts c WHERE c.association_id = v_op.association_id AND c.account_number = '1100';
  SELECT c.id INTO v_prepaid FROM public.chart_of_accounts c WHERE c.association_id = v_op.association_id AND c.account_number = '2100';
  v_clearing := COALESCE(v_clearing, v_cash);
  IF v_fund IS NULL OR v_clearing IS NULL OR v_ar IS NULL THEN
    RAISE EXCEPTION 'reverse_online_payment: books_not_open' USING errcode = '55000';
  END IF;

  -- Walk the posted parts from the last one back (lowest priority first). Parts
  -- already partly reversed by an earlier refund are skipped by cents arithmetic:
  -- we consume v_reversed_before first.
  FOR v_part IN
    SELECT e FROM jsonb_array_elements(v_op.posted_result) WITH ORDINALITY AS t(e, n) ORDER BY n DESC
  LOOP
    EXIT WHEN v_done >= v_want;
    v_cents := (v_part ->> 'cents')::bigint;
    IF v_reversed_before > 0 THEN
      IF v_reversed_before >= v_cents THEN
        v_reversed_before := v_reversed_before - v_cents;
        CONTINUE;
      END IF;
      v_cents := v_cents - v_reversed_before;
      v_reversed_before := 0;
    END IF;
    v_take := LEAST(v_cents, v_want - v_done);

    IF (v_part ->> 'credit_id') IS NOT NULL THEN
      SELECT * INTO v_cr FROM public.unapplied_credits WHERE id = (v_part ->> 'credit_id')::uuid FOR UPDATE;
      IF FOUND THEN
        IF round(v_cr.remaining * 100)::bigint < v_take THEN
          v_short := v_short + (v_take - round(v_cr.remaining * 100)::bigint);   -- already applied to a charge
          UPDATE public.unapplied_credits SET remaining = 0 WHERE id = v_cr.id;
        ELSE
          UPDATE public.unapplied_credits SET remaining = remaining - v_take / 100.0 WHERE id = v_cr.id;
        END IF;
      END IF;
      v_num := public.next_journal_entry_number(v_op.association_id, to_char(v_on, 'YYYY'));
      SELECT p.id INTO v_period FROM public.fiscal_periods p
       WHERE p.association_id = v_op.association_id AND p.status = 'open' AND v_on BETWEEN p.start_date AND p.end_date
       ORDER BY p.start_date DESC LIMIT 1;
      IF v_period IS NULL THEN
        RAISE EXCEPTION 'reverse_online_payment: books_not_open' USING errcode = '55000';
      END IF;
      INSERT INTO public.journal_entries
        (organization_id, association_id, fiscal_period_id, entry_number, entry_date, memo, source, source_id, status)
      VALUES (v_op.organization_id, v_op.association_id, v_period, v_num, v_on,
              'Reversal of online payment credit (' || p_kind || ')', 'reversing', v_cr.id, 'draft')
      RETURNING id INTO v_je_id;
      INSERT INTO public.ledger_entries (organization_id, journal_entry_id, account_id, fund_id, debit_amount, credit_amount)
      VALUES (v_op.organization_id, v_je_id, COALESCE(v_prepaid, v_ar), v_fund, v_take / 100.0, 0),
             (v_op.organization_id, v_je_id, v_clearing,                v_fund, 0, v_take / 100.0);
      UPDATE public.journal_entries SET status = 'posted', posted_at = now() WHERE id = v_je_id;
      v_jes := v_jes || v_je_id;
    ELSE
      SELECT a.* INTO v_ass FROM public.assessments a WHERE a.id = (v_part ->> 'assessment_id')::uuid FOR UPDATE;
      IF NOT FOUND THEN CONTINUE; END IF;
      INSERT INTO public.payments (organization_id, unit_id, assessment_id, amount, payment_method, external_ref, paid_at)
      VALUES (v_op.organization_id, v_op.unit_id, v_ass.id, -(v_take / 100.0), v_op.method_type,
              p_kind || ':' || p_ref, (v_on::timestamp + interval '12 hours') AT TIME ZONE 'UTC')
      RETURNING id INTO v_pay_id;
      v_num := public.next_journal_entry_number(v_ass.association_id, to_char(v_on, 'YYYY'));
      SELECT p.id INTO v_period FROM public.fiscal_periods p
       WHERE p.association_id = v_op.association_id AND p.status = 'open' AND v_on BETWEEN p.start_date AND p.end_date
       ORDER BY p.start_date DESC LIMIT 1;
      IF v_period IS NULL THEN
        RAISE EXCEPTION 'reverse_online_payment: books_not_open' USING errcode = '55000';
      END IF;
      INSERT INTO public.journal_entries
        (organization_id, association_id, fiscal_period_id, entry_number, entry_date, memo, source, source_id, status)
      VALUES (v_op.organization_id, v_ass.association_id, v_period, v_num, v_on,
              'Reversal of online payment (' || p_kind || ')', 'reversing', v_pay_id, 'draft')
      RETURNING id INTO v_je_id;
      INSERT INTO public.ledger_entries (organization_id, journal_entry_id, account_id, fund_id, debit_amount, credit_amount)
      VALUES (v_op.organization_id, v_je_id, v_ar,       v_fund, v_take / 100.0, 0),
             (v_op.organization_id, v_je_id, v_clearing, v_fund, 0, v_take / 100.0);
      UPDATE public.journal_entries SET status = 'posted', posted_at = now() WHERE id = v_je_id;
      UPDATE public.payments SET journal_entry_id = v_je_id WHERE id = v_pay_id;

      SELECT COALESCE(sum(pm.amount), 0) INTO v_paid FROM public.payments pm WHERE pm.assessment_id = v_ass.id;
      UPDATE public.assessments
         SET status = CASE WHEN round(v_paid * 100) >= round(v_ass.amount * 100) THEN 'paid'
                           WHEN round(v_paid * 100) > 0 THEN 'partial'
                           ELSE 'open' END
       WHERE id = v_ass.id AND status IN ('open', 'partial', 'paid');
      v_jes := v_jes || v_je_id;
    END IF;
    v_done := v_done + v_take;
  END LOOP;

  v_new_status := CASE
    WHEN p_kind = 'dispute_lost' THEN 'dispute_lost'
    WHEN p_kind = 'failed'       THEN 'failed'
    ELSE 'partially_refunded' END;
  -- A refund that brings the total reversed to everything posted is 'refunded'.
  IF p_kind = 'refund' THEN
    SELECT CASE WHEN COALESCE(sum(CASE WHEN a.kind = 'refund_failed' THEN -a.amount_cents ELSE a.amount_cents END), 0) + v_done >= v_posted_total
                THEN 'refunded' ELSE 'partially_refunded' END
      INTO v_new_status
      FROM public.online_payment_adjustments a
     WHERE a.online_payment_id = p_attempt AND a.kind IN ('failed', 'refund', 'dispute_lost', 'refund_failed');
  END IF;

  UPDATE public.online_payments
     SET status = v_new_status,
         failure_code = CASE WHEN p_kind = 'failed' THEN left(COALESCE(p_reason, 'returned'), 120) ELSE failure_code END
   WHERE id = p_attempt;

  INSERT INTO public.online_payment_adjustments
    (organization_id, association_id, online_payment_id, kind, stripe_ref, amount_cents, reason, journal_entry_ids, created_by)
  VALUES (v_op.organization_id, v_op.association_id, p_attempt, p_kind, p_ref, v_done, left(p_reason, 300), v_jes, p_by)
  RETURNING id INTO v_adj_id;

  -- Returned-payment fee: only for a failed (returned) ACH, only if configured,
  -- once per attempt (unique memo_code). Added as an ordinary charge due today.
  IF p_kind = 'failed' AND COALESCE(p_returned_fee_cents, 0) > 0 THEN
    SELECT p.id INTO v_period FROM public.fiscal_periods p
     WHERE p.association_id = v_op.association_id AND p.status = 'open' AND v_on BETWEEN p.start_date AND p.end_date
     ORDER BY p.start_date DESC LIMIT 1;
    IF v_period IS NOT NULL THEN
      INSERT INTO public.assessments
        (organization_id, association_id, unit_id, fiscal_period_id, assessment_type, amount, due_date, status, memo_code)
      VALUES (v_op.organization_id, v_op.association_id, v_op.unit_id, v_period, 'fine',
              p_returned_fee_cents / 100.0, v_on, 'open', 'RTN-' || v_op.id::text)
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_fee_id;
      IF v_fee_id IS NOT NULL THEN
        INSERT INTO public.online_payment_adjustments
          (organization_id, association_id, online_payment_id, kind, stripe_ref, amount_cents, reason, created_by)
        VALUES (v_op.organization_id, v_op.association_id, p_attempt, 'returned_fee', 'fee:' || v_fee_id::text,
                p_returned_fee_cents, 'Returned ACH payment fee', p_by);
      END IF;
    END IF;
  END IF;

  INSERT INTO public.audit_log (org_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (v_op.organization_id, p_by, 'online_payment.' || p_kind, 'online_payment', v_op.id,
          jsonb_build_object('method', v_op.method_type, 'reversed_cents', v_done, 'short_cents', v_short,
                             'returned_fee_cents', CASE WHEN v_fee_id IS NULL THEN 0 ELSE p_returned_fee_cents END));

  PERFORM set_config('app.money_already_moved', 'off', true);
  RETURN jsonb_build_object('already_applied', false, 'status', v_new_status, 'reversed_cents', v_done,
                            'short_cents', v_short, 'adjustment_id', v_adj_id, 'returned_fee_id', v_fee_id);
END;
$fn$;

-- 5. money that already moved is not blocked by the closed-period triggers ----------------
-- record_online_payment_success is re-created with the same body plus a transaction-local
-- setting around its writes (also done in reverse_online_payment above); the triggers skip
-- only when it is on AND the JWT role is service_role, see money_already_moved().
CREATE OR REPLACE FUNCTION public.record_online_payment_success(
  p_attempt uuid,
  p_paid_on date,
  p_charge  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_op         public.online_payments%ROWTYPE;
  v_part       jsonb;
  v_kind       text;
  v_aid        uuid;
  v_cents      bigint;
  v_apply      bigint;
  v_over       bigint := 0;
  v_ass        public.assessments%ROWTYPE;
  v_paid       numeric;
  v_left_cents bigint;
  v_fund       uuid;
  v_cash       uuid;
  v_clearing   uuid;
  v_ar         uuid;
  v_prepaid    uuid;
  v_period     uuid;
  v_pay_id     uuid;
  v_credit_id  uuid;
  v_je_id      uuid;
  v_num        text;
  v_memo       text;
  v_paid_at    timestamptz;
  v_result     jsonb := '[]'::jsonb;
  v_applied    bigint := 0;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'record_online_payment_success: service role only' USING errcode = '42501';
  END IF;
  IF p_paid_on IS NULL OR p_paid_on < DATE '2000-01-01' OR p_paid_on > (now() AT TIME ZONE 'UTC')::date + 1 THEN
    RAISE EXCEPTION 'record_online_payment_success: bad payment date' USING errcode = '22023';
  END IF;

  SELECT * INTO v_op FROM public.online_payments WHERE id = p_attempt FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'record_online_payment_success: unknown attempt' USING errcode = '23503';
  END IF;

  -- Replay: already posted. Same answer, no writes.
  IF v_op.posted_at IS NOT NULL THEN
    RETURN jsonb_build_object('already_posted', true, 'status', v_op.status, 'posted', v_op.posted_result);
  END IF;
  -- 'failed' is allowed here: a declined card (or a bounced bank debit) marks the
  -- attempt failed, and the payer may retry on the SAME PaymentIntent, which then
  -- succeeds. Only a never-posted attempt reaches this line (posted_at is checked
  -- above), so a returned payment that WAS posted is never posted twice.
  IF v_op.status NOT IN ('created', 'requires_action', 'processing', 'failed') THEN
    RAISE EXCEPTION 'record_online_payment_success: attempt is %, cannot post', v_op.status USING errcode = '55000';
  END IF;

  PERFORM set_config('app.money_already_moved', 'on', true);
  SELECT f.id INTO v_fund FROM public.funds f WHERE f.association_id = v_op.association_id AND f.code = 'OPERATING';
  SELECT c.id INTO v_cash FROM public.chart_of_accounts c WHERE c.association_id = v_op.association_id AND c.account_number = '1010';
  SELECT c.id INTO v_clearing FROM public.chart_of_accounts c WHERE c.association_id = v_op.association_id AND c.account_number = '1015' AND c.is_active;
  SELECT c.id INTO v_ar FROM public.chart_of_accounts c WHERE c.association_id = v_op.association_id AND c.account_number = '1100';
  SELECT c.id INTO v_prepaid FROM public.chart_of_accounts c WHERE c.association_id = v_op.association_id AND c.account_number = '2100';
  IF v_fund IS NULL OR COALESCE(v_clearing, v_cash) IS NULL OR v_ar IS NULL THEN
    RAISE EXCEPTION 'record_online_payment_success: books_not_open' USING errcode = '55000';
  END IF;
  v_clearing := COALESCE(v_clearing, v_cash);

  v_paid_at := (p_paid_on::timestamp + interval '12 hours') AT TIME ZONE 'UTC';
  v_memo := 'Online payment (' || v_op.method_type || ')';

  FOR v_part IN SELECT * FROM jsonb_array_elements(v_op.allocation) LOOP
    v_cents := (v_part ->> 'cents')::bigint;
    v_kind := COALESCE(v_part ->> 'kind', 'charge');
    IF v_cents IS NULL OR v_cents <= 0 THEN
      RAISE EXCEPTION 'record_online_payment_success: bad allocation part' USING errcode = '22023';
    END IF;

    IF v_kind = 'credit' THEN
      v_over := v_over + v_cents;
      CONTINUE;
    ELSIF v_kind <> 'charge' THEN
      RAISE EXCEPTION 'record_online_payment_success: unknown part kind' USING errcode = '22023';
    END IF;

    v_aid := (v_part ->> 'assessment_id')::uuid;
    SELECT a.* INTO v_ass FROM public.assessments a WHERE a.id = v_aid FOR UPDATE;
    IF NOT FOUND OR v_ass.organization_id <> v_op.organization_id OR v_ass.unit_id <> v_op.unit_id
       OR v_ass.deleted_at IS NOT NULL OR v_ass.status NOT IN ('open', 'partial') THEN
      v_over := v_over + v_cents;          -- charge gone or settled meanwhile: all of it overflows
      CONTINUE;
    END IF;
    SELECT COALESCE(sum(pm.amount), 0) INTO v_paid FROM public.payments pm WHERE pm.assessment_id = v_aid;
    v_left_cents := round((v_ass.amount - v_paid) * 100)::bigint;
    v_apply := LEAST(v_cents, GREATEST(v_left_cents, 0));
    v_over := v_over + (v_cents - v_apply);
    IF v_apply = 0 THEN CONTINUE; END IF;

    INSERT INTO public.payments (organization_id, unit_id, assessment_id, amount, payment_method, external_ref, paid_at)
    VALUES (v_op.organization_id, v_op.unit_id, v_aid, v_apply / 100.0, v_op.method_type,
            COALESCE(p_charge, v_op.stripe_payment_intent_id), v_paid_at)
    RETURNING id INTO v_pay_id;

    v_num := public.next_journal_entry_number(v_ass.association_id, to_char(p_paid_on, 'YYYY'));
    INSERT INTO public.journal_entries
      (organization_id, association_id, fiscal_period_id, entry_number, entry_date, memo, source, source_id, status)
    VALUES
      (v_op.organization_id, v_ass.association_id, v_ass.fiscal_period_id, v_num, p_paid_on, v_memo, 'ar_payment', v_pay_id, 'draft')
    RETURNING id INTO v_je_id;
    INSERT INTO public.ledger_entries (organization_id, journal_entry_id, account_id, fund_id, debit_amount, credit_amount)
    VALUES (v_op.organization_id, v_je_id, v_clearing, v_fund, v_apply / 100.0, 0),
           (v_op.organization_id, v_je_id, v_ar,       v_fund, 0, v_apply / 100.0);
    UPDATE public.journal_entries SET status = 'posted', posted_at = now() WHERE id = v_je_id;
    UPDATE public.payments SET journal_entry_id = v_je_id WHERE id = v_pay_id;

    UPDATE public.assessments
       SET status = CASE WHEN round((v_paid + v_apply / 100.0) * 100) >= round(v_ass.amount * 100) THEN 'paid' ELSE 'partial' END
     WHERE id = v_aid;

    v_result := v_result || jsonb_build_object('payment_id', v_pay_id, 'assessment_id', v_aid,
                                               'journal_entry_id', v_je_id, 'cents', v_apply);
    v_applied := v_applied + v_apply;
  END LOOP;

  -- Overflow (an explicit credit part, or a charge that filled up meanwhile).
  IF v_over > 0 THEN
    SELECT p.id INTO v_period FROM public.fiscal_periods p
     WHERE p.association_id = v_op.association_id AND p.status = 'open'
       AND p_paid_on BETWEEN p.start_date AND p.end_date
     ORDER BY p.start_date DESC LIMIT 1;
    IF v_period IS NULL THEN
      RAISE EXCEPTION 'record_online_payment_success: books_not_open' USING errcode = '55000';
    END IF;
    INSERT INTO public.unapplied_credits
      (organization_id, association_id, unit_id, amount, remaining, payment_method, received_on, note, created_by)
    VALUES
      (v_op.organization_id, v_op.association_id, v_op.unit_id, v_over / 100.0, v_over / 100.0,
       v_op.method_type, p_paid_on, 'Online payment', v_op.user_id)
    RETURNING id INTO v_credit_id;
    v_num := public.next_journal_entry_number(v_op.association_id, to_char(p_paid_on, 'YYYY'));
    INSERT INTO public.journal_entries
      (organization_id, association_id, fiscal_period_id, entry_number, entry_date, memo, source, source_id, status)
    VALUES
      (v_op.organization_id, v_op.association_id, v_period, v_num, p_paid_on, v_memo || ' (unapplied credit)', 'ar_payment', v_credit_id, 'draft')
    RETURNING id INTO v_je_id;
    INSERT INTO public.ledger_entries (organization_id, journal_entry_id, account_id, fund_id, debit_amount, credit_amount)
    VALUES (v_op.organization_id, v_je_id, v_clearing, v_fund, v_over / 100.0, 0),
           (v_op.organization_id, v_je_id, COALESCE(v_prepaid, v_ar), v_fund, 0, v_over / 100.0);
    UPDATE public.journal_entries SET status = 'posted', posted_at = now() WHERE id = v_je_id;
    UPDATE public.unapplied_credits SET journal_entry_id = v_je_id WHERE id = v_credit_id;
    v_result := v_result || jsonb_build_object('credit_id', v_credit_id, 'journal_entry_id', v_je_id, 'cents', v_over);
  END IF;

  UPDATE public.online_payments
     SET status = 'succeeded', posted_at = now(), settled_on = p_paid_on, posted_result = v_result,
         stripe_charge_id = COALESCE(p_charge, stripe_charge_id), failure_code = NULL
   WHERE id = p_attempt;

  -- Ids and cents only: no names, addresses, bank or card details.
  INSERT INTO public.audit_log (org_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (v_op.organization_id, v_op.user_id, 'online_payment.posted', 'online_payment', v_op.id,
          jsonb_build_object('method', v_op.method_type, 'dues_cents', v_op.dues_cents,
                             'applied_cents', v_applied, 'credit_cents', v_over, 'source', v_op.source));

  PERFORM set_config('app.money_already_moved', 'off', true);
  RETURN jsonb_build_object('already_posted', false, 'status', 'succeeded', 'posted', v_result);
END;
$fn$;

REVOKE ALL ON FUNCTION public.record_online_payment_success(uuid, date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_online_payment_success(uuid, date, text) TO service_role;
REVOKE ALL ON FUNCTION public.reverse_online_payment(uuid, text, text, bigint, text, date, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_online_payment(uuid, text, text, bigint, text, date, integer, uuid) TO service_role;

-- post-checks ---------------------------------------------------------------
DO $post$
BEGIN
  IF (SELECT count(*) FROM pg_trigger
       WHERE NOT tgisinternal
         AND tgname IN ('journal_entries_closed_period_guard', 'assessments_closed_period_guard',
                        'journal_entries_posted_immutable', 'ledger_entries_posted_immutable')) <> 4 THEN
    RAISE EXCEPTION '0082: expected 4 money-integrity triggers';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'unapplied_credits'
                  AND policyname = 'unapplied_credits_resident_select' AND qual LIKE '%resident_credit_in_window%') THEN
    RAISE EXCEPTION '0082: unapplied_credits_resident_select not rewritten';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.online_payment_adjustments'::regclass
                    AND conname = 'online_payment_adjustments_kind_check'
                    AND pg_get_constraintdef(oid) LIKE '%refund_failed%') THEN
    RAISE EXCEPTION '0082: refund_failed missing from the kind check';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.reverse_online_payment(uuid,text,text,bigint,text,date,integer,uuid)'::regprocedure
                  AND prosrc LIKE '%refund_failed%'
                  AND prosrc LIKE '%app.money_already_moved%') THEN
    RAISE EXCEPTION '0082: reverse_online_payment not replaced';
  END IF;
  RAISE NOTICE '0082 ok: money integrity applied.';
END $post$;

COMMIT;
