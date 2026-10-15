-- Production apply for migration 0061_accounting_rls.
-- Spec: docs/specs/2026-10-15-accounting-rls.md
--
-- Run the parts separately in the Supabase SQL editor, IN ORDER.
--
-- Ordering vs code: the branch's code changes (role gates on the accounting
-- server actions + Plaid/board-packet routes) are safe to deploy before OR
-- after this migration: they only refuse callers the new policies would
-- refuse anyway, and every legitimate (board/admin) path works under both
-- the old and new policies. Applying 0061 first is fine too.
--
-- Rollback (if a resident portal regression appears): re-run the single
-- org_access policy per table from migrations/0006_accounting.sql lines
-- 486-520 (plus 0000_schema for hoa_dues). Not expected to be needed; the
-- resident reads are covered by tests.

-- ─── PART 1a: pre-check, current policies (read-only) ─────────────────
-- Expect: one `org_access` ALL policy per table, qual =
-- (organization_id = ANY (auth_org_ids())) [hoa_dues: org_id]. ANY other
-- policy listed here is unexpected; 0061 drops it too (permissive policies
-- OR together, so a leftover would keep the hole open). Screenshot this
-- output before running part 2; it is the rollback reference.
SELECT tablename, policyname, cmd, roles::text, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN (
     'funds', 'chart_of_accounts', 'fiscal_periods', 'journal_entries',
     'ledger_entries', 'budgets', 'budget_line_items', 'bank_accounts',
     'bank_transactions', 'bank_reconciliations', 'assessments', 'invoices',
     'payments', 'payment_methods', 'payment_plans', 'zelle_inbound_matches',
     'recurring_journal_entries', 'adjusting_entries', 'closing_entries',
     'plaid_items', 'hoa_dues')
 ORDER BY tablename, policyname;

-- ─── PART 1b: pre-check, prerequisites (read-only) ────────────────────
-- Every column must be true.
SELECT
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'auth_org_ids')           AS has_auth_org_ids,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'auth_is_board_or_admin') AS has_auth_is_board_or_admin,
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'units' AND column_name = 'legacy_hoa_property_id') AS units_legacy_link,
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'property_residents' AND column_name = 'moved_out_at') AS pr_moved_out_at,
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'ownerships' AND column_name = 'valid_to') AS ownerships_valid_to,
  to_regclass('public.plaid_items') IS NOT NULL AS has_plaid_items,
  to_regclass('public.hoa_dues')    IS NOT NULL AS has_hoa_dues;

-- ─── PART 1c: pre-check, existing double posts (read-only) ────────────
-- Bank transactions that already carry more than one POSTED bank_rec JE.
-- Expect: zero rows. If any rows come back, 0061 still applies the RLS
-- but SKIPS the unique index (with a WARNING). Each listed transaction
-- needs one of its JEs reversed (Accounting -> Ledger -> Reverse) by a
-- human; then re-run part 2 to create the index. Ids and counts only.
SELECT je.source_id AS bank_transaction_id,
       count(*)     AS posted_bank_rec_jes,
       array_agg(je.id ORDER BY je.created_at) AS journal_entry_ids
  FROM public.journal_entries je
 WHERE je.source = 'bank_rec' AND je.status = 'posted' AND je.source_id IS NOT NULL
 GROUP BY je.source_id
HAVING count(*) > 1;

-- ─── PART 2: apply ────────────────────────────────────────────────────
-- Paste the ENTIRE contents of migrations/0061_accounting_rls.sql (a
-- single DO block, no BEGIN/COMMIT). Expected output:
--   NOTICE: 0061 ok: money tables role-scoped; double-post index present.
-- (or "... index SKIPPED (duplicates exist)" plus a WARNING, see 1c).

-- ─── PART 3: verify (read-only) ───────────────────────────────────────
-- Every column must be true (double_post_index may be false ONLY if 1c
-- returned rows).
WITH money(t) AS (
  VALUES ('funds'), ('chart_of_accounts'), ('fiscal_periods'), ('journal_entries'),
         ('ledger_entries'), ('budgets'), ('budget_line_items'), ('bank_accounts'),
         ('bank_transactions'), ('bank_reconciliations'), ('assessments'), ('invoices'),
         ('payments'), ('payment_methods'), ('payment_plans'), ('zelle_inbound_matches'),
         ('recurring_journal_entries'), ('adjusting_entries'), ('closing_entries'),
         ('plaid_items'), ('hoa_dues')
), pol AS (
  SELECT p.* FROM pg_policies p JOIN money m ON m.t = p.tablename WHERE p.schemaname = 'public'
)
SELECT
  -- the old org-only policy is gone everywhere
  NOT EXISTS (SELECT 1 FROM pol WHERE policyname = 'org_access')                         AS org_access_gone,
  -- RLS still enabled on all 21
  (SELECT bool_and(c.relrowsecurity) FROM pg_class c JOIN money m ON c.oid = ('public.' || m.t)::regclass) AS rls_enabled_all,
  -- 17 org-column tables x 4 per-command (14 board-only + hoa_dues +
  -- assessments + payments) + 3 child FOR ALL + 1 plaid INSERT = 72
  (SELECT count(*) = 72 FROM pol)                                                         AS policy_count_72,
  -- every write policy names the board/admin helper
  (SELECT bool_and(coalesce(with_check, qual) LIKE '%auth_is_board_or_admin%')
     FROM pol WHERE cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL'))                          AS writes_require_board,
  -- only assessments/payments have a non-board read path
  (SELECT bool_and(tablename IN ('assessments', 'payments'))
     FROM pol WHERE cmd = 'SELECT' AND qual LIKE '%auth_resident_unit_ids%')               AS resident_reads_only_dues,
  (SELECT count(*) = 1 AND bool_and(cmd = 'INSERT') FROM pol WHERE tablename = 'plaid_items') AS plaid_insert_only,
  (SELECT prosecdef FROM pg_proc WHERE proname = 'auth_resident_unit_ids')                AS helper_security_definer,
  has_function_privilege('authenticated', 'public.auth_resident_unit_ids()', 'EXECUTE')   AS helper_callable,
  EXISTS (SELECT 1 FROM pg_indexes
           WHERE schemaname = 'public' AND indexname = 'journal_entries_bank_rec_posted_uniq') AS double_post_index;
