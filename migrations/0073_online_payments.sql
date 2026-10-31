-- 0073_online_payments.sql
--
-- DRAFT. NOT APPLIED. Written for docs/decisions/2026-10-31-online-dues-payments-design.md
-- (BL-035 online dues by card and ACH through Stripe Connect; BL-036 autopay).
-- The owner applies it (runbook: pbcopy the SQL, wait for confirmation), then a
-- one-line PR flips M8_APPLIED in packages/db/src/m8.ts. Until then nothing in
-- the app reads or writes these objects, and the app behaves exactly as today.
--
-- Everything is idempotent (IF NOT EXISTS / DROP IF EXISTS / OR REPLACE) and in
-- one transaction.
--
-- What it adds:
--   1. association_stripe_accounts  one connected (Standard) Stripe account per
--      association, its onboarding state, and the fee policy per method.
--   2. online_payment_methods       a resident's saved card or bank (Stripe ids
--      and display facts only: brand, last4, bank name. No card data, ever).
--   3. autopay_enrollments          BL-036: opt-in, maximum, the mandate record.
--   4. online_payments              one row per payment attempt: the frozen
--      allocation, the fee, the Stripe ids, the status machine.
--   5. online_payment_adjustments   refunds, disputes, returned-payment fees.
--   6. stripe_payouts               each Stripe payout, matched to a bank line.
--   7. record_online_payment_success(): posts a succeeded payment to the owner
--      ledger and the journal. SERVICE ROLE ONLY. Idempotent per attempt.
--   8. reverse_online_payment(): failed ACH, refund, lost dispute. SERVICE ROLE
--      ONLY. Idempotent per (attempt, kind, Stripe reference).
--
-- Money rules baked in here, not left to the app:
--   * amounts are integer cents in the new tables; numeric(14,2) only where an
--     existing table already uses it (payments, assessments, journal lines).
--   * a Stripe event can be replayed any number of times and posts once
--     (unique Stripe ids, row lock plus status check inside the functions).
--   * a charge that was settled between "Pay" and the webhook (the board
--     recorded a check meanwhile) never fails the posting: the overflow becomes
--     an unapplied credit, because the money has already left the resident.
--   * the web roles can read what they should and can write NOTHING in these
--     tables; every write goes through the server with the service role.

BEGIN;

-- ── 0. prerequisites ───────────────────────────────────────────────────
DO $pre$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'orgs', 'profiles', 'associations', 'units', 'assessments', 'payments',
    'journal_entries', 'ledger_entries', 'fiscal_periods', 'funds',
    'chart_of_accounts', 'bank_transactions', 'audit_log', 'unapplied_credits',
    'stripe_webhook_events', 'je_number_counters'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION '0073: public.% is missing', t;
    END IF;
  END LOOP;
  IF to_regprocedure('public.tenant_fk_same_org()') IS NULL THEN
    RAISE EXCEPTION '0073: tenant_fk_same_org() is missing; apply 0070_tenant_isolation.sql first';
  END IF;
  IF to_regprocedure('public.auth_is_board_or_admin(uuid)') IS NULL
     OR to_regprocedure('public.auth_org_ids()') IS NULL
     OR to_regprocedure('public.auth_resident_unit_ids()') IS NULL THEN
    RAISE EXCEPTION '0073: an auth helper is missing (0012, 0061, 0070)';
  END IF;
  IF to_regprocedure('public.next_journal_entry_number(uuid,text)') IS NULL THEN
    RAISE EXCEPTION '0073: apply 0072_m7_batch.sql first (next_journal_entry_number is missing)';
  END IF;
END $pre$;

-- ── 1. association_stripe_accounts ─────────────────────────────────────
-- One row per association that has started Stripe Connect onboarding. The
-- association's own Stripe account (Standard) holds the money; this row is only
-- our pointer to it plus the board's fee choices.
CREATE TABLE IF NOT EXISTS public.association_stripe_accounts (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  association_id         uuid NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  stripe_account_id      text NOT NULL CHECK (stripe_account_id ~ '^acct_[A-Za-z0-9]{8,64}$'),
  -- Mirrors of account.updated; the webhook is the only writer after creation.
  details_submitted      boolean NOT NULL DEFAULT false,
  charges_enabled        boolean NOT NULL DEFAULT false,
  payouts_enabled        boolean NOT NULL DEFAULT false,
  requirements_due       jsonb   NOT NULL DEFAULT '[]'::jsonb,   -- currently_due + past_due codes only
  disabled_reason        text    CHECK (disabled_reason IS NULL OR char_length(disabled_reason) <= 120),
  -- The board's switch. Residents see "Pay now" only when enabled AND
  -- charges_enabled AND payouts_enabled.
  online_payments_enabled boolean NOT NULL DEFAULT false,
  -- Who pays the processing fee, per method (the pricing decision, design doc 2).
  ach_fee_payer          text NOT NULL DEFAULT 'association'
    CHECK (ach_fee_payer IN ('association', 'homeowner')),
  card_fee_payer         text NOT NULL DEFAULT 'homeowner'
    CHECK (card_fee_payer IN ('association', 'homeowner')),
  -- Card surcharge switch: off until counsel clears it for the association's
  -- state and the network registration is done (design doc 2.3).
  card_fee_acknowledged_at timestamptz,
  card_fee_acknowledged_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Returned-payment fee charged to the owner when an ACH debit fails.
  -- NULL or 0 = none. Capped here; the legal cap by state is the app's check.
  returned_payment_fee_cents integer
    CHECK (returned_payment_fee_cents IS NULL OR returned_payment_fee_cents BETWEEN 0 AND 10000),
  started_by             uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (association_id),
  UNIQUE (stripe_account_id)
);
CREATE INDEX IF NOT EXISTS association_stripe_accounts_org_idx
  ON public.association_stripe_accounts (organization_id);

COMMENT ON TABLE public.association_stripe_accounts IS
  '0073 (BL-035): the association''s own Standard Stripe account and fee policy. Funds never pass through the platform. Board/admin read; written only by the server (service role).';

-- ── 2. online_payment_methods ──────────────────────────────────────────
-- A resident's saved method, living on the ASSOCIATION's connected account
-- (direct charges: the Customer and PaymentMethod are objects of that account).
-- So one person in two associations has two rows. Display facts only.
CREATE TABLE IF NOT EXISTS public.online_payment_methods (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  association_id     uuid NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  user_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stripe_account_id  text NOT NULL,
  stripe_customer_id text NOT NULL CHECK (stripe_customer_id ~ '^cus_'),
  stripe_payment_method_id text NOT NULL CHECK (stripe_payment_method_id ~ '^pm_'),
  method_type        text NOT NULL CHECK (method_type IN ('ach', 'card')),
  brand              text CHECK (brand IS NULL OR char_length(brand) <= 40),   -- 'visa', or the bank name
  last4              text CHECK (last4 IS NULL OR last4 ~ '^[0-9]{4}$'),
  exp_month          smallint CHECK (exp_month IS NULL OR exp_month BETWEEN 1 AND 12),
  exp_year           smallint CHECK (exp_year IS NULL OR exp_year BETWEEN 2000 AND 2200),
  -- ACH only: how the bank was verified, and the Stripe mandate to debit it.
  verification       text CHECK (verification IS NULL OR verification IN ('financial_connections', 'microdeposits')),
  stripe_mandate_id  text,
  is_default         boolean NOT NULL DEFAULT false,
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stripe_account_id, stripe_payment_method_id)
);
-- At most one default per person per association.
CREATE UNIQUE INDEX IF NOT EXISTS online_payment_methods_one_default
  ON public.online_payment_methods (association_id, user_id)
  WHERE is_default AND is_active;
CREATE INDEX IF NOT EXISTS online_payment_methods_user_idx
  ON public.online_payment_methods (user_id, association_id) WHERE is_active;

COMMENT ON TABLE public.online_payment_methods IS
  '0073: saved card/bank pointers (Stripe ids, brand, last4). No card or bank numbers exist anywhere in our systems. A person reads only their own rows; the board does not see them.';

-- ── 3. autopay_enrollments (BL-036) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.autopay_enrollments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  association_id     uuid NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  unit_id            uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  user_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  payment_method_id  uuid NOT NULL REFERENCES public.online_payment_methods(id) ON DELETE RESTRICT,
  -- The homeowner's own ceiling per charge run. A run that would exceed it
  -- does not charge; it emails the owner instead (design doc 4.4).
  max_cents          integer NOT NULL CHECK (max_cents BETWEEN 100 AND 5000000),
  -- Which charges autopay may pay. Regular dues by default; fees and fines only
  -- if the owner ticks "also pay late fees and fines".
  include_other_charges boolean NOT NULL DEFAULT false,
  status             text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'canceled')),
  -- Authorization record (NACHA / card-network proof of consent).
  authorization_text_version text NOT NULL CHECK (char_length(authorization_text_version) BETWEEN 1 AND 40),
  authorized_at      timestamptz NOT NULL DEFAULT now(),
  canceled_at        timestamptz,
  -- Circuit breaker: consecutive failed runs. At 2 the enrollment pauses itself.
  consecutive_failures smallint NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  last_notified_at   timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'canceled') = (canceled_at IS NOT NULL))
);
-- One live enrollment per home.
CREATE UNIQUE INDEX IF NOT EXISTS autopay_enrollments_one_live_per_unit
  ON public.autopay_enrollments (unit_id) WHERE status IN ('active', 'paused');
CREATE INDEX IF NOT EXISTS autopay_enrollments_active_idx
  ON public.autopay_enrollments (association_id) WHERE status = 'active';

COMMENT ON TABLE public.autopay_enrollments IS
  '0073 (BL-036): opt-in autopay with the homeowner''s maximum and the authorization record. Owner and board read; written only by the server.';

-- ── 4. online_payments ─────────────────────────────────────────────────
-- One row per attempt. allocation is frozen when the attempt is created
-- (the Georgia order, lib/collections/ga-payment-order.ts), so what the resident
-- was shown is what posts.
--
-- status machine:
--   created -> requires_action -> processing -> succeeded
--                    \-> failed          \-> failed (ACH return, days later)
--   created|requires_action -> canceled
--   succeeded -> partially_refunded | refunded | disputed -> (dispute_won) succeeded
--                                                         \-> dispute_lost
CREATE TABLE IF NOT EXISTS public.online_payments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  association_id     uuid NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  unit_id            uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  user_id            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,   -- NULL: not a person (never today)
  source             text NOT NULL DEFAULT 'resident'
    CHECK (source IN ('resident', 'autopay', 'board_on_behalf')),
  autopay_enrollment_id uuid REFERENCES public.autopay_enrollments(id) ON DELETE SET NULL,
  -- One autopay run per enrollment per charge date: the double-charge guard.
  autopay_period     text CHECK (autopay_period IS NULL OR autopay_period ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  method_type        text NOT NULL CHECK (method_type IN ('ach', 'card')),
  online_payment_method_id uuid REFERENCES public.online_payment_methods(id) ON DELETE SET NULL,

  -- Money, integer cents. total = dues + fee_collected. The Stripe cost is a
  -- fact about the charge, kept for reconciliation, filled in later.
  dues_cents         integer NOT NULL CHECK (dues_cents > 0),
  fee_cents          integer NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
  fee_payer          text NOT NULL CHECK (fee_payer IN ('association', 'homeowner')),
  total_cents        integer NOT NULL CHECK (total_cents > 0),
  application_fee_cents integer NOT NULL DEFAULT 0 CHECK (application_fee_cents >= 0),
  stripe_fee_cents   integer CHECK (stripe_fee_cents IS NULL OR stripe_fee_cents >= 0),
  CHECK (total_cents = dues_cents + CASE WHEN fee_payer = 'homeowner' THEN fee_cents ELSE 0 END),

  -- [{"assessment_id": "<uuid>", "cents": 12345} ... , {"kind":"credit","cents":500}]
  allocation         jsonb NOT NULL
    CHECK (jsonb_typeof(allocation) = 'array' AND jsonb_array_length(allocation) BETWEEN 1 AND 200),
  allocation_mode    text NOT NULL CHECK (allocation_mode IN ('ga_statutory', 'oldest_first')),
  -- What posting actually did: [{"payment_id","assessment_id","credit_id","journal_entry_id","cents"}]
  posted_result      jsonb,

  status             text NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'requires_action', 'processing', 'succeeded', 'failed', 'canceled',
                      'partially_refunded', 'refunded', 'disputed', 'dispute_lost')),
  failure_code       text CHECK (failure_code IS NULL OR char_length(failure_code) <= 120),

  stripe_account_id  text NOT NULL,
  stripe_payment_intent_id text CHECK (stripe_payment_intent_id IS NULL OR stripe_payment_intent_id ~ '^pi_'),
  stripe_charge_id   text,
  -- Client-generated per Pay screen load; also sent to Stripe as the
  -- Idempotency-Key. A double tap or retry returns the same row.
  idempotency_key    text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 16 AND 100),
  receipt_sent_at    timestamptz,

  settled_on         date,            -- when the money was confirmed (card: same day, ACH: days later)
  posted_at          timestamptz,     -- set once, inside record_online_payment_success
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (status NOT IN ('succeeded', 'partially_refunded', 'refunded', 'disputed', 'dispute_lost') OR posted_at IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS online_payments_intent_uniq
  ON public.online_payments (stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS online_payments_idem_uniq
  ON public.online_payments (association_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS online_payments_autopay_once
  ON public.online_payments (autopay_enrollment_id, autopay_period)
  WHERE autopay_enrollment_id IS NOT NULL AND autopay_period IS NOT NULL
    AND status NOT IN ('failed', 'canceled');
CREATE INDEX IF NOT EXISTS online_payments_unit_idx
  ON public.online_payments (unit_id, created_at DESC);
CREATE INDEX IF NOT EXISTS online_payments_assoc_status_idx
  ON public.online_payments (association_id, status, created_at DESC);
-- The ACH "still pending" sweep (a safety net for a missed webhook).
CREATE INDEX IF NOT EXISTS online_payments_pending_idx
  ON public.online_payments (created_at) WHERE status IN ('requires_action', 'processing');
-- Charge id from a refund or dispute event finds the attempt.
CREATE INDEX IF NOT EXISTS online_payments_charge_idx
  ON public.online_payments (stripe_charge_id) WHERE stripe_charge_id IS NOT NULL;

COMMENT ON TABLE public.online_payments IS
  '0073 (BL-035): one row per card/ACH attempt, the frozen Georgia-order allocation, fee and Stripe ids. Board reads the association''s rows; a resident reads their home''s. Written only by the server and by record_online_payment_success / reverse_online_payment.';

-- ── 5. online_payment_adjustments ──────────────────────────────────────
-- Refunds, disputes and returned-payment fees: the append-only trail. The
-- unique Stripe reference makes a replayed event a no-op.
CREATE TABLE IF NOT EXISTS public.online_payment_adjustments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  association_id     uuid NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  online_payment_id  uuid NOT NULL REFERENCES public.online_payments(id) ON DELETE CASCADE,
  kind               text NOT NULL
    CHECK (kind IN ('failed', 'refund', 'dispute_lost', 'dispute_won', 'returned_fee')),
  -- re_..., dp_..., or 'failed:<pi>' for a failed ACH.
  stripe_ref         text NOT NULL CHECK (char_length(stripe_ref) BETWEEN 1 AND 255),
  amount_cents       integer NOT NULL CHECK (amount_cents >= 0),
  reason             text CHECK (reason IS NULL OR char_length(reason) <= 300),
  journal_entry_ids  uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  created_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,   -- board member who asked for a refund
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (online_payment_id, kind, stripe_ref)
);
CREATE INDEX IF NOT EXISTS online_payment_adjustments_assoc_idx
  ON public.online_payment_adjustments (association_id, created_at DESC);

-- ── 6. stripe_payouts ──────────────────────────────────────────────────
-- Each payout from an association's Stripe balance to its bank. Matched to the
-- Plaid bank line by amount, arrival date and account (design doc 3.7).
CREATE TABLE IF NOT EXISTS public.stripe_payouts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  association_id     uuid NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  stripe_account_id  text NOT NULL,
  stripe_payout_id   text NOT NULL CHECK (stripe_payout_id ~ '^po_'),
  amount_cents       bigint NOT NULL CHECK (amount_cents > 0),
  fee_cents          bigint NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),   -- Stripe fees the association bore inside this payout
  arrival_date       date NOT NULL,
  status             text NOT NULL CHECK (status IN ('pending', 'in_transit', 'paid', 'failed', 'canceled')),
  bank_transaction_id uuid REFERENCES public.bank_transactions(id) ON DELETE SET NULL,
  journal_entry_id   uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,   -- clearing -> bank, once paid and matched
  matched_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stripe_account_id, stripe_payout_id)
);
CREATE INDEX IF NOT EXISTS stripe_payouts_assoc_arrival_idx
  ON public.stripe_payouts (association_id, arrival_date DESC);
CREATE INDEX IF NOT EXISTS stripe_payouts_unmatched_idx
  ON public.stripe_payouts (association_id, arrival_date) WHERE bank_transaction_id IS NULL AND status = 'paid';

-- ── 7. updated_at, same-org foreign keys ───────────────────────────────
CREATE OR REPLACE FUNCTION public.online_payments_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $f$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$f$;

DO $touch$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['association_stripe_accounts', 'autopay_enrollments', 'online_payments', 'stripe_payouts'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_touch', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.online_payments_touch()',
                   t || '_touch', t);
  END LOOP;
END $touch$;

-- A row can never point at a unit, association, method or payment of another
-- organization (same ratchet as 0072; tests/integration/schema/fk-same-org-ratchet.test.ts).
DO $triggers$
DECLARE
  r record;
  v_name text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('association_stripe_accounts', 'association_id',        'associations',             'organization_id', 'organization_id'),
      ('online_payment_methods',      'association_id',        'associations',             'organization_id', 'organization_id'),
      ('autopay_enrollments',         'association_id',        'associations',             'organization_id', 'organization_id'),
      ('autopay_enrollments',         'unit_id',               'units',                    'organization_id', 'organization_id'),
      ('autopay_enrollments',         'payment_method_id',     'online_payment_methods',   'organization_id', 'organization_id'),
      ('online_payments',             'association_id',        'associations',             'organization_id', 'organization_id'),
      ('online_payments',             'unit_id',               'units',                    'organization_id', 'organization_id'),
      ('online_payments',             'autopay_enrollment_id', 'autopay_enrollments',      'organization_id', 'organization_id'),
      ('online_payments',             'online_payment_method_id', 'online_payment_methods','organization_id', 'organization_id'),
      ('online_payment_adjustments',  'online_payment_id',     'online_payments',          'organization_id', 'organization_id'),
      ('stripe_payouts',              'association_id',        'associations',             'organization_id', 'organization_id'),
      ('stripe_payouts',              'journal_entry_id',      'journal_entries',          'organization_id', 'organization_id')
    ) v(child, fk, parent, parent_org, child_org)
  LOOP
    v_name := 'zz_org_fk_' || r.child || '_' || r.fk;
    IF octet_length(v_name) > 63 THEN
      v_name := left(v_name, 54) || '_' || substr(md5(v_name), 1, 8);
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', v_name, r.child);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OF %I, %I ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.tenant_fk_same_org(%L, %L, %L, %L)',
      v_name, r.fk, r.child_org, r.child,
      r.fk, r.parent, r.parent_org, r.child_org);
  END LOOP;
END $triggers$;

-- ── 8. row level security ──────────────────────────────────────────────
-- Read-only for the web roles. There is deliberately no INSERT/UPDATE/DELETE
-- policy on any of these tables: the server writes with the service role, which
-- bypasses RLS, so a resident's own session can never edit a payment, an
-- enrollment or the association's Stripe pointer through the REST API (the hole
-- 0004's FOR ALL org_access policy left open on compliance_settings).
ALTER TABLE public.association_stripe_accounts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_payment_methods       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.autopay_enrollments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_payments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_payment_adjustments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_payouts               ENABLE ROW LEVEL SECURITY;

-- board / admin read
DO $pol$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['association_stripe_accounts', 'online_payments', 'online_payment_adjustments',
                           'stripe_payouts', 'autopay_enrollments'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_board_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
         USING (organization_id = ANY (public.auth_org_ids())
                AND public.auth_is_board_or_admin(organization_id))',
      t || '_board_select', t);
  END LOOP;
END $pol$;

-- a resident reads their own home's payments
DROP POLICY IF EXISTS online_payments_resident_select ON public.online_payments;
CREATE POLICY online_payments_resident_select ON public.online_payments
  FOR SELECT TO authenticated
  USING (organization_id = ANY (public.auth_org_ids())
         AND unit_id = ANY ((SELECT public.auth_resident_unit_ids())::uuid[]));

-- a person reads their own enrollment and saved methods; the board does not see methods
DROP POLICY IF EXISTS autopay_enrollments_own_select ON public.autopay_enrollments;
CREATE POLICY autopay_enrollments_own_select ON public.autopay_enrollments
  FOR SELECT TO authenticated
  USING (organization_id = ANY (public.auth_org_ids())
         AND user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS online_payment_methods_own_select ON public.online_payment_methods;
CREATE POLICY online_payment_methods_own_select ON public.online_payment_methods
  FOR SELECT TO authenticated
  USING (organization_id = ANY (public.auth_org_ids())
         AND user_id = (SELECT auth.uid()));

-- Nothing here is for anon, and PUBLIC keeps no table privileges.
REVOKE ALL ON public.association_stripe_accounts, public.online_payment_methods, public.autopay_enrollments,
              public.online_payments, public.online_payment_adjustments, public.stripe_payouts
  FROM PUBLIC, anon;
-- Authenticated may only read (RLS above narrows the rows); writes need the service role.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.association_stripe_accounts, public.online_payment_methods,
              public.autopay_enrollments, public.online_payments, public.online_payment_adjustments,
              public.stripe_payouts
  FROM authenticated;
GRANT SELECT ON public.association_stripe_accounts, public.online_payment_methods, public.autopay_enrollments,
              public.online_payments, public.online_payment_adjustments, public.stripe_payouts
  TO authenticated;

-- ── 9. a returned-payment fee posts once ───────────────────────────────
-- reverse_online_payment() adds the fee charge with memo_code 'RTN-<attempt id>'.
CREATE UNIQUE INDEX IF NOT EXISTS assessments_returned_fee_once
  ON public.assessments (memo_code) WHERE memo_code LIKE 'RTN-%';

-- ── 10. record_online_payment_success ──────────────────────────────────
-- Posts a succeeded payment to the owner ledger and the journal, in one
-- transaction: a payments row and a balanced journal entry per part, the
-- charge's new status, the audit row. Called by the Connect webhook (card:
-- payment_intent.succeeded; ACH: payment_intent.succeeded days after
-- payment_intent.processing). SERVICE ROLE ONLY.
--
-- Idempotent: the attempt row is locked; if it is already posted the stored
-- result comes back and nothing is written. A charge that no longer has room
-- (settled meanwhile) takes only what it has left; the overflow becomes ONE
-- unapplied credit. Cash lands in 1015 "Online payments clearing" when the
-- association has that account (the app creates it when Connect is enabled),
-- else 1010; the payout reconciliation moves clearing to the bank (doc 3.7).
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
  IF v_op.status NOT IN ('created', 'requires_action', 'processing') THEN
    RAISE EXCEPTION 'record_online_payment_success: attempt is %, cannot post', v_op.status USING errcode = '55000';
  END IF;

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

  RETURN jsonb_build_object('already_posted', false, 'status', 'succeeded', 'posted', v_result);
END;
$fn$;

REVOKE ALL ON FUNCTION public.record_online_payment_success(uuid, date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_online_payment_success(uuid, date, text) TO service_role;

-- ── 11. reverse_online_payment ─────────────────────────────────────────
-- p_kind:
--   'failed'        an ACH debit that was already posted comes back (R01 etc.).
--                   Full reversal. If the association set a returned-payment
--                   fee, it is added to the home's ledger (once).
--                   A failure BEFORE posting (status processing/requires_action)
--                   posts nothing: it only marks the attempt failed.
--   'refund'        p_cents back to the resident, taken from the lowest-priority
--                   part first (LIFO over the posted parts), so the highest
--                   priority charges stay paid.
--   'dispute_lost'  full reversal; 'dispute_won' is recorded only.
-- Reversal = a payments row with a negative amount and a mirror journal entry
-- (source 'reversing'); the charge goes back to open/partial. A credit part is
-- reduced from its remaining; if the owner already used that credit the shortfall
-- is returned in the result as short_cents so the app can flag the board.
-- SERVICE ROLE ONLY. Idempotent per (attempt, kind, p_ref).
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
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'reverse_online_payment: service role only' USING errcode = '42501';
  END IF;
  IF p_kind NOT IN ('failed', 'refund', 'dispute_lost', 'dispute_won') THEN
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

  -- What was posted, and what has already been reversed.
  SELECT COALESCE(sum((e ->> 'cents')::bigint), 0) INTO v_posted_total
    FROM jsonb_array_elements(v_op.posted_result) e;
  SELECT COALESCE(sum(a.amount_cents), 0) INTO v_reversed_before
    FROM public.online_payment_adjustments a
   WHERE a.online_payment_id = p_attempt AND a.kind IN ('failed', 'refund', 'dispute_lost');
  IF v_reversed_before >= v_posted_total THEN
    RAISE EXCEPTION 'reverse_online_payment: already fully reversed' USING errcode = '55000';
  END IF;

  v_want := CASE WHEN p_kind = 'refund' AND p_cents IS NOT NULL THEN p_cents
                 ELSE v_posted_total - v_reversed_before END;
  IF v_want <= 0 OR v_want > v_posted_total - v_reversed_before THEN
    RAISE EXCEPTION 'reverse_online_payment: amount is more than what is left to reverse' USING errcode = '23514';
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
    SELECT CASE WHEN COALESCE(sum(a.amount_cents), 0) + v_done >= v_posted_total THEN 'refunded' ELSE 'partially_refunded' END
      INTO v_new_status
      FROM public.online_payment_adjustments a
     WHERE a.online_payment_id = p_attempt AND a.kind IN ('failed', 'refund', 'dispute_lost');
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

  RETURN jsonb_build_object('already_applied', false, 'status', v_new_status, 'reversed_cents', v_done,
                            'short_cents', v_short, 'adjustment_id', v_adj_id, 'returned_fee_id', v_fee_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.reverse_online_payment(uuid, text, text, bigint, text, date, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_online_payment(uuid, text, text, bigint, text, date, integer, uuid) TO service_role;

COMMIT;
