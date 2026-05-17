-- 0006_accounting.sql
-- v1.1 Module 6 — Accounting. Spec §13.
--
-- Non-negotiables (spec §13.1) enforced here:
--   1. Double-entry ledger is source of truth — no balance columns anywhere
--      except cached `bank_accounts.current_balance` from Plaid (informational).
--   2. Every JE balances AND is fund-balanced (validate_je_balances trigger).
--   3. No deletes — corrections are reversing entries.
--   4. (Hash-chained audit log is enforced separately in `audit_log` — out of
--      scope for this migration; lands when the customer-facing audit log
--      lands in month 4.)
--   5. Three accounting bases via presentation, not storage.
--
-- Idempotent. Safe to re-run.
--
-- Cross-file FK note: `public.invoices.vendor_id` references
-- `public.vendors(id)` which is created in 0007. We add that FK in 0007 to
-- keep this file standalone.

-- ─── associations.slug — memo code prefix for Pay-by-Zelle (ADR-005) ─

ALTER TABLE public.associations
  ADD COLUMN IF NOT EXISTS slug text;

-- Idempotent backfill: slugify name when missing. UPPER + alnum-only.
UPDATE public.associations
   SET slug = upper(regexp_replace(name, '[^A-Za-z0-9]', '', 'g'))
 WHERE slug IS NULL OR slug = '';

-- After backfill, enforce non-null + unique-per-org.
ALTER TABLE public.associations
  ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS associations_org_slug_uniq
  ON public.associations(organization_id, slug);

-- ─── funds ──────────────────────────────────────────────────────────
-- One per accounting fund. Operating + Reserve are universal; Special
-- Assessment and Capex are per-association.
CREATE TABLE IF NOT EXISTS public.funds (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  association_id  uuid NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  code            text NOT NULL,                  -- 'OPERATING', 'RESERVE', 'SPECIAL_ASSESSMENT', 'CAPEX'
  name            text NOT NULL,
  fund_type       text NOT NULL
    CHECK (fund_type IN ('operating', 'reserve', 'special_assessment', 'capex')),
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (association_id, code)
);

CREATE INDEX IF NOT EXISTS funds_association_idx
  ON public.funds(association_id);

-- ─── chart_of_accounts ──────────────────────────────────────────────
-- Per-association COA. Account numbers follow standard HOA practice
-- (1xxx assets, 2xxx liabilities, 3xxx equity, 4xxx income, 5xxx
-- expenses) but no enforcement — managers may use their CPA's numbering.
CREATE TABLE IF NOT EXISTS public.chart_of_accounts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  association_id     uuid NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  account_number     text NOT NULL,
  account_name       text NOT NULL,
  account_type       text NOT NULL
    CHECK (account_type IN ('asset', 'liability', 'equity', 'income', 'expense')),
  parent_account_id  uuid REFERENCES public.chart_of_accounts(id),
  fund_id            uuid REFERENCES public.funds(id),   -- nullable: shared (e.g. AR) vs fund-specific (Operating Cash)
  is_active          boolean NOT NULL DEFAULT true,
  description        text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (association_id, account_number)
);

CREATE INDEX IF NOT EXISTS coa_association_idx
  ON public.chart_of_accounts(association_id);

-- ─── fiscal_periods ─────────────────────────────────────────────────
-- Status: open → closing → closed. Closing entries land in `closing_entries`
-- and the period moves to closed. Once closed, JEs may not be posted into
-- the period (validated at application layer; we DO NOT cascade-block at
-- the DB layer because reversing entries against closed periods are still
-- valid — but only if booked in the current open period).
CREATE TABLE IF NOT EXISTS public.fiscal_periods (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  association_id  uuid NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  status          text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closing', 'closed')),
  closed_at       timestamptz,
  closed_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CHECK (end_date > start_date),
  UNIQUE (association_id, start_date, end_date)
);

CREATE INDEX IF NOT EXISTS fiscal_periods_association_idx
  ON public.fiscal_periods(association_id, start_date DESC);

-- ─── journal_entries (header) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  association_id    uuid NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  fiscal_period_id  uuid NOT NULL REFERENCES public.fiscal_periods(id),
  entry_number      text NOT NULL,                -- 'JE-2026-00123'
  entry_date        date NOT NULL,
  memo              text NOT NULL,
  source            text NOT NULL
    CHECK (source IN ('manual', 'ap_invoice', 'ar_payment', 'bank_rec', 'recurring', 'closing', 'reversing')),
  source_id         uuid,                          -- soft-reference to invoices/payments/etc.
  status            text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'posted', 'reversed')),
  posted_at         timestamptz,
  posted_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reversed_by_id    uuid REFERENCES public.journal_entries(id),
  reverses_id       uuid REFERENCES public.journal_entries(id),
  ai_generated      boolean NOT NULL DEFAULT false,
  ai_workflow_id    text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (association_id, entry_number)
);

CREATE INDEX IF NOT EXISTS je_association_period_idx
  ON public.journal_entries(association_id, fiscal_period_id);
CREATE INDEX IF NOT EXISTS je_status_idx
  ON public.journal_entries(association_id, status);

-- ─── ledger_entries (lines) ─────────────────────────────────────────
-- Each line is one debit or one credit (never both), per the CHECK below.
CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  journal_entry_id    uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_id          uuid NOT NULL REFERENCES public.chart_of_accounts(id),
  fund_id             uuid NOT NULL REFERENCES public.funds(id),
  debit_amount        numeric(14,2) NOT NULL DEFAULT 0,
  credit_amount       numeric(14,2) NOT NULL DEFAULT 0,
  memo                text,
  CHECK (debit_amount >= 0 AND credit_amount >= 0),
  CHECK ((debit_amount > 0 AND credit_amount = 0) OR (credit_amount > 0 AND debit_amount = 0))
);

CREATE INDEX IF NOT EXISTS ledger_entries_je_idx
  ON public.ledger_entries(journal_entry_id);
CREATE INDEX IF NOT EXISTS ledger_entries_account_idx
  ON public.ledger_entries(account_id);
CREATE INDEX IF NOT EXISTS ledger_entries_fund_idx
  ON public.ledger_entries(fund_id);

-- ─── validate_je_balances trigger ───────────────────────────────────
-- Spec §13.1 non-negotiable #2: every posted JE must balance overall AND
-- per fund. An unbalanced fund means an inter-fund transfer is hiding
-- somewhere and must be made explicit (its own JE pair).
CREATE OR REPLACE FUNCTION public.validate_je_balances() RETURNS trigger AS $$
DECLARE
  v_total_debits          numeric;
  v_total_credits         numeric;
  v_unbalanced_fund_count int;
BEGIN
  IF NEW.status <> 'posted' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(debit_amount), 0), COALESCE(SUM(credit_amount), 0)
    INTO v_total_debits, v_total_credits
  FROM public.ledger_entries
  WHERE journal_entry_id = NEW.id;

  IF v_total_debits <> v_total_credits THEN
    RAISE EXCEPTION 'JE % does not balance: debits=% credits=%',
      NEW.id, v_total_debits, v_total_credits;
  END IF;

  SELECT COUNT(*) INTO v_unbalanced_fund_count FROM (
    SELECT fund_id
    FROM public.ledger_entries
    WHERE journal_entry_id = NEW.id
    GROUP BY fund_id
    HAVING SUM(debit_amount) <> SUM(credit_amount)
  ) sub;

  IF v_unbalanced_fund_count > 0 THEN
    RAISE EXCEPTION 'JE % is not fund-balanced — inter-fund transfers must be explicit', NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_je_balances ON public.journal_entries;
CREATE TRIGGER trg_validate_je_balances
  BEFORE UPDATE OF status ON public.journal_entries
  FOR EACH ROW
  WHEN (NEW.status = 'posted' AND OLD.status <> 'posted')
  EXECUTE FUNCTION public.validate_je_balances();

-- ─── budgets ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.budgets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  association_id    uuid NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  fiscal_period_id  uuid NOT NULL REFERENCES public.fiscal_periods(id),
  fund_id           uuid NOT NULL REFERENCES public.funds(id),
  status            text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'archived')),
  approved_at       timestamptz,
  approved_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (association_id, fiscal_period_id, fund_id, status)
    DEFERRABLE INITIALLY IMMEDIATE
);

CREATE TABLE IF NOT EXISTS public.budget_line_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id   uuid NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
  account_id  uuid NOT NULL REFERENCES public.chart_of_accounts(id),
  amount      numeric(14,2) NOT NULL,
  notes       text
);

CREATE INDEX IF NOT EXISTS budget_line_items_budget_idx
  ON public.budget_line_items(budget_id);

-- ─── bank_accounts (Plaid-linked) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  association_id     uuid NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  fund_id            uuid NOT NULL REFERENCES public.funds(id),
  plaid_item_id      text,
  plaid_account_id   text,
  account_name       text NOT NULL,
  bank_name          text,
  last4              text,
  current_balance    numeric(14,2),         -- last known from Plaid; INFORMATIONAL ONLY; never used for reports
  last_synced_at     timestamptz,
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS bank_accounts_plaid_uniq
  ON public.bank_accounts(plaid_item_id, plaid_account_id)
  WHERE plaid_item_id IS NOT NULL AND plaid_account_id IS NOT NULL;

-- ─── bank_transactions (Plaid feed) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  bank_account_id          uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  plaid_transaction_id     text UNIQUE,
  amount                   numeric(14,2) NOT NULL,   -- positive = inbound deposit; negative = outbound
  posted_date              date NOT NULL,
  memo                     text,
  merchant                 text,
  matched_journal_entry_id uuid REFERENCES public.journal_entries(id),
  match_method             text
    CHECK (match_method IN ('auto_exact', 'auto_fuzzy', 'manual')),
  match_confidence         numeric(3,2),
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bank_transactions_account_date_idx
  ON public.bank_transactions(bank_account_id, posted_date DESC);
CREATE INDEX IF NOT EXISTS bank_transactions_unmatched_idx
  ON public.bank_transactions(bank_account_id, posted_date DESC)
  WHERE matched_journal_entry_id IS NULL;

-- ─── bank_reconciliations (period close artifact) ───────────────────
CREATE TABLE IF NOT EXISTS public.bank_reconciliations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  bank_account_id     uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  statement_date      date NOT NULL,
  statement_balance   numeric(14,2),
  reconciled_balance  numeric(14,2),
  reconciled_at       timestamptz,
  reconciled_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at         timestamptz,
  approved_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (bank_account_id, statement_date)
);

-- ─── assessments (homeowner AR side) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assessments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  association_id    uuid NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  unit_id           uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  fiscal_period_id  uuid NOT NULL REFERENCES public.fiscal_periods(id),
  assessment_type   text NOT NULL
    CHECK (assessment_type IN ('regular', 'special', 'late_fee', 'fine')),
  amount            numeric(14,2) NOT NULL CHECK (amount > 0),
  due_date          date NOT NULL,
  status            text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'partial', 'paid', 'waived', 'written_off')),
  memo_code         text,                              -- e.g. 'MP-1247-DUES' for Pay-by-Zelle (ADR-005)
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assessments_unit_open_idx
  ON public.assessments(unit_id, due_date)
  WHERE status IN ('open', 'partial');
CREATE INDEX IF NOT EXISTS assessments_association_period_idx
  ON public.assessments(association_id, fiscal_period_id);
CREATE INDEX IF NOT EXISTS assessments_memo_code_idx
  ON public.assessments(memo_code)
  WHERE memo_code IS NOT NULL;

-- ─── invoices (vendor AP side) ──────────────────────────────────────
-- vendor_id FK is added in 0007 after public.vendors exists.
CREATE TABLE IF NOT EXISTS public.invoices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  association_id      uuid NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  vendor_id           uuid,                            -- FK added in 0007
  invoice_number      text NOT NULL,
  invoice_date        date NOT NULL,
  due_date            date,
  amount              numeric(14,2) NOT NULL CHECK (amount > 0),
  status              text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'coded', 'approved', 'paid', 'disputed', 'cancelled')),
  ai_generated        boolean NOT NULL DEFAULT false,
  ai_workflow_id      text,
  raw_document_path   text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoices_association_status_idx
  ON public.invoices(association_id, status);
CREATE INDEX IF NOT EXISTS invoices_vendor_idx
  ON public.invoices(vendor_id);

-- ─── payments (joint AR + AP — see payment_method) ──────────────────
CREATE TABLE IF NOT EXISTS public.payments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  unit_id            uuid REFERENCES public.units(id) ON DELETE SET NULL,
  assessment_id      uuid REFERENCES public.assessments(id) ON DELETE SET NULL,
  invoice_id         uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  amount             numeric(14,2) NOT NULL CHECK (amount <> 0),
  payment_method     text NOT NULL
    CHECK (payment_method IN ('ach', 'card', 'apple_pay', 'google_pay', 'zelle_assisted', 'check', 'cash', 'other')),
  external_ref       text,                              -- Stripe charge id, Plaid txn id, check number
  paid_at            timestamptz NOT NULL,
  journal_entry_id   uuid REFERENCES public.journal_entries(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  -- Exactly one of assessment_id or invoice_id must be set (AR or AP).
  CHECK (
    (assessment_id IS NOT NULL AND invoice_id IS NULL) OR
    (assessment_id IS NULL AND invoice_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS payments_assessment_idx ON public.payments(assessment_id);
CREATE INDEX IF NOT EXISTS payments_invoice_idx    ON public.payments(invoice_id);
CREATE INDEX IF NOT EXISTS payments_paid_at_idx    ON public.payments(organization_id, paid_at DESC);

-- ─── payment_methods (tokenized resident methods) ───────────────────
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id            uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  unit_id                    uuid REFERENCES public.units(id) ON DELETE CASCADE,
  user_id                    uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  method_type                text NOT NULL CHECK (method_type IN ('ach', 'card')),
  stripe_payment_method_id   text,                       -- tokenized
  last4                      text,
  is_default                 boolean NOT NULL DEFAULT false,
  is_active                  boolean NOT NULL DEFAULT true,
  created_at                 timestamptz NOT NULL DEFAULT now()
);

-- ─── payment_plans ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_plans (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  unit_id             uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  total_amount        numeric(14,2) NOT NULL CHECK (total_amount > 0),
  installment_count   integer NOT NULL CHECK (installment_count > 0),
  installment_amount  numeric(14,2) NOT NULL CHECK (installment_amount > 0),
  start_date          date NOT NULL,
  status              text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'active', 'completed', 'defaulted', 'cancelled')),
  approved_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ─── zelle_inbound_matches (W18 audit-side artifact) ────────────────
-- One row per inbound bank transaction that W18 examined. `status` records
-- whether the memo-code regex matched, fuzzy-matched, or went to manager
-- override.
CREATE TABLE IF NOT EXISTS public.zelle_inbound_matches (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  bank_transaction_id     uuid NOT NULL REFERENCES public.bank_transactions(id) ON DELETE CASCADE,
  memo_code               text NOT NULL,
  matched_assessment_id   uuid REFERENCES public.assessments(id) ON DELETE SET NULL,
  matched_unit_id         uuid REFERENCES public.units(id) ON DELETE SET NULL,
  status                  text NOT NULL
    CHECK (status IN ('matched', 'unmatched', 'manual_override')),
  ai_workflow_id          text,                          -- ai_runs.id for the W18 run
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS zelle_inbound_matches_txn_idx
  ON public.zelle_inbound_matches(bank_transaction_id);

-- ─── recurring_journal_entries ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recurring_journal_entries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  association_id    uuid NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  template_je_id    uuid NOT NULL REFERENCES public.journal_entries(id),
  cadence           text NOT NULL
    CHECK (cadence IN ('daily', 'weekly', 'monthly', 'quarterly', 'annually')),
  next_run_date     date NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ─── adjusting_entries ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.adjusting_entries (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id   uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  reason             text NOT NULL,
  flagged_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  flagged_at         timestamptz NOT NULL DEFAULT now()
);

-- ─── closing_entries ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.closing_entries (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_period_id   uuid NOT NULL REFERENCES public.fiscal_periods(id),
  journal_entry_id   uuid NOT NULL REFERENCES public.journal_entries(id),
  closing_type       text NOT NULL
    CHECK (closing_type IN ('income_to_equity', 'expense_to_equity', 'inter_fund_transfer'))
);

-- ─── RLS on every accounting table ──────────────────────────────────
-- Pattern matches 0004 — `org_access` policy keyed on auth_org_ids().

ALTER TABLE public.funds                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chart_of_accounts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_periods            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_line_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_accounts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_reconciliations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessments               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_plans             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zelle_inbound_matches     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adjusting_entries         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.closing_entries           ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_access ON public.funds;
DROP POLICY IF EXISTS org_access ON public.chart_of_accounts;
DROP POLICY IF EXISTS org_access ON public.fiscal_periods;
DROP POLICY IF EXISTS org_access ON public.journal_entries;
DROP POLICY IF EXISTS org_access ON public.ledger_entries;
DROP POLICY IF EXISTS org_access ON public.budgets;
DROP POLICY IF EXISTS org_access ON public.budget_line_items;
DROP POLICY IF EXISTS org_access ON public.bank_accounts;
DROP POLICY IF EXISTS org_access ON public.bank_transactions;
DROP POLICY IF EXISTS org_access ON public.bank_reconciliations;
DROP POLICY IF EXISTS org_access ON public.assessments;
DROP POLICY IF EXISTS org_access ON public.invoices;
DROP POLICY IF EXISTS org_access ON public.payments;
DROP POLICY IF EXISTS org_access ON public.payment_methods;
DROP POLICY IF EXISTS org_access ON public.payment_plans;
DROP POLICY IF EXISTS org_access ON public.zelle_inbound_matches;
DROP POLICY IF EXISTS org_access ON public.recurring_journal_entries;
DROP POLICY IF EXISTS org_access ON public.adjusting_entries;
DROP POLICY IF EXISTS org_access ON public.closing_entries;

CREATE POLICY org_access ON public.funds                     USING (organization_id = ANY (public.auth_org_ids()));
CREATE POLICY org_access ON public.chart_of_accounts         USING (organization_id = ANY (public.auth_org_ids()));
CREATE POLICY org_access ON public.fiscal_periods            USING (organization_id = ANY (public.auth_org_ids()));
CREATE POLICY org_access ON public.journal_entries           USING (organization_id = ANY (public.auth_org_ids()));
CREATE POLICY org_access ON public.ledger_entries            USING (organization_id = ANY (public.auth_org_ids()));
CREATE POLICY org_access ON public.budgets                   USING (organization_id = ANY (public.auth_org_ids()));
-- budget_line_items inherits via the budget — explicit policy still required
-- for RLS. We delegate via EXISTS so renaming the column on `budgets` doesn't
-- silently break here.
CREATE POLICY org_access ON public.budget_line_items
  USING (EXISTS (
    SELECT 1 FROM public.budgets b
     WHERE b.id = budget_line_items.budget_id
       AND b.organization_id = ANY (public.auth_org_ids())
  ));
CREATE POLICY org_access ON public.bank_accounts             USING (organization_id = ANY (public.auth_org_ids()));
CREATE POLICY org_access ON public.bank_transactions         USING (organization_id = ANY (public.auth_org_ids()));
CREATE POLICY org_access ON public.bank_reconciliations      USING (organization_id = ANY (public.auth_org_ids()));
CREATE POLICY org_access ON public.assessments               USING (organization_id = ANY (public.auth_org_ids()));
CREATE POLICY org_access ON public.invoices                  USING (organization_id = ANY (public.auth_org_ids()));
CREATE POLICY org_access ON public.payments                  USING (organization_id = ANY (public.auth_org_ids()));
CREATE POLICY org_access ON public.payment_methods           USING (organization_id = ANY (public.auth_org_ids()));
CREATE POLICY org_access ON public.payment_plans             USING (organization_id = ANY (public.auth_org_ids()));
CREATE POLICY org_access ON public.zelle_inbound_matches     USING (organization_id = ANY (public.auth_org_ids()));
CREATE POLICY org_access ON public.recurring_journal_entries USING (organization_id = ANY (public.auth_org_ids()));
-- adjusting/closing inherit via journal_entry — delegate explicitly.
CREATE POLICY org_access ON public.adjusting_entries
  USING (EXISTS (
    SELECT 1 FROM public.journal_entries je
     WHERE je.id = adjusting_entries.journal_entry_id
       AND je.organization_id = ANY (public.auth_org_ids())
  ));
CREATE POLICY org_access ON public.closing_entries
  USING (EXISTS (
    SELECT 1 FROM public.journal_entries je
     WHERE je.id = closing_entries.journal_entry_id
       AND je.organization_id = ANY (public.auth_org_ids())
  ));
