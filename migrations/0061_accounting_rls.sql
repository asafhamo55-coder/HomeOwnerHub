-- 0061_accounting_rls.sql
--
-- Role-scope every money table. Spec: docs/specs/2026-10-15-accounting-rls.md
-- Apply script (pre-check -> this block -> verify):
--   docs/specs/2026-10-15-accounting-rls-apply.sql
--
-- THE HOLE
--
-- 0006 gave every accounting table a single
--
--   CREATE POLICY org_access ON public.<t>
--     USING (organization_id = ANY (public.auth_org_ids()));
--
-- a FOR ALL policy gated on org membership alone. With no WITH CHECK the
-- USING expression also gates INSERT and UPDATE, so any member of the org
-- -- a plain resident included -- could, through the anon key and their
-- own session: post journal entries, mark their own assessment paid,
-- insert payments, re-point bank matches, close fiscal periods, and READ
-- the org's Plaid access tokens (plaid_items.access_token), every
-- neighbour's balance, the GL and the bank feed. Proven by
-- tests/integration/security/accounting-rls.test.ts (89 failures before
-- this migration).
--
-- THE SHAPE (per command, replacing org_access)
--
--   SELECT  board/admin of the row's org.
--           assessments + payments additionally: a resident may read rows
--           for units they are linked to -- exactly the two reads the
--           resident portal makes (lib/resident-dashboard.ts getDues). The
--           link mirrors lib/resident.ts getOwnedUnits(): a current
--           ownership, OR a current property_residents row whose email
--           matches theirs (units.legacy_hoa_property_id bridge).
--   INSERT / UPDATE / DELETE  board/admin of the row's org.
--   plaid_items  INSERT only (board/admin). No user ever reads, edits or
--           deletes an access token; plaid-sync runs as service role.
--
-- Board, not admin-only, for closing periods: the app lets board close a
-- period today (no role gate on /accounting/periods), so admin-only would
-- be a behaviour change, not a security fix. Noted in the spec.
--
-- Every service-role path (W18 + approval posting, Plaid sync/webhook,
-- late fees, recurring JEs, Stripe webhooks) bypasses RLS and is
-- unaffected.
--
-- ALL existing policies on these tables are dropped, not just org_access:
-- policies are permissive and OR together, so a leftover hand-made policy
-- in production would silently keep the hole open.
--
-- DOUBLE POST GUARD
--
-- A partial unique index allows one POSTED bank_rec journal entry per
-- bank transaction (manual "Confirm match" racing an approval would
-- otherwise post twice). Drafts are excluded so an orphan draft can never
-- block a re-post; the loser of a race fails its draft->posted UPDATE and
-- postJournalEntry deletes its draft. Reversed entries are excluded so a
-- corrected re-match still works. If production ALREADY holds duplicates
-- the index is skipped with a WARNING (RLS still applies); the apply
-- script's pre-check lists them.
--
-- Idempotent. Safe to re-run. ONE statement (single DO block) -- see 0048's
-- header for why multi-statement scripts are unreliable in the Supabase
-- SQL editor.

DO $mig$
DECLARE
  t     text;
  p     record;
  money text[] := ARRAY[
    'funds', 'chart_of_accounts', 'fiscal_periods', 'journal_entries',
    'ledger_entries', 'budgets', 'budget_line_items', 'bank_accounts',
    'bank_transactions', 'bank_reconciliations', 'assessments', 'invoices',
    'payments', 'payment_methods', 'payment_plans', 'zelle_inbound_matches',
    'recurring_journal_entries', 'adjusting_entries', 'closing_entries',
    'plaid_items', 'hoa_dues'
  ];
  -- Tables with an organization_id column and no resident read.
  simple text[] := ARRAY[
    'funds', 'chart_of_accounts', 'fiscal_periods', 'journal_entries',
    'ledger_entries', 'budgets', 'bank_accounts', 'bank_transactions',
    'bank_reconciliations', 'invoices', 'payment_methods', 'payment_plans',
    'zelle_inbound_matches', 'recurring_journal_entries'
  ];
  dupes int;
BEGIN
  -- ─── helper: units the caller is linked to as a resident ──────────
  CREATE OR REPLACE FUNCTION public.auth_resident_unit_ids()
  RETURNS uuid[]
  LANGUAGE sql STABLE
  SECURITY DEFINER
  SET search_path = public
  AS $fn$
    SELECT COALESCE(
      ARRAY(
        SELECT o.unit_id
          FROM public.ownerships o
         WHERE o.owner_user_id = auth.uid()
           AND o.valid_to IS NULL
        UNION
        SELECT u.id
          FROM public.property_residents pr
          JOIN public.units u ON u.legacy_hoa_property_id = pr.property_id
         WHERE pr.moved_out_at IS NULL
           AND pr.email IS NOT NULL
           AND lower(pr.email) = lower((SELECT au.email FROM auth.users au WHERE au.id = auth.uid()))
      ),
      ARRAY[]::uuid[]
    );
  $fn$;
  GRANT EXECUTE ON FUNCTION public.auth_resident_unit_ids() TO authenticated, service_role;

  -- ─── drop every existing policy on every money table ──────────────
  FOREACH t IN ARRAY money LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
  END LOOP;

  -- ─── board/admin-only tables (organization_id) ────────────────────
  FOREACH t IN ARRAY simple LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
         USING (public.auth_is_board_or_admin(organization_id))', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
         WITH CHECK (public.auth_is_board_or_admin(organization_id))', t || '_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
         USING (public.auth_is_board_or_admin(organization_id))
         WITH CHECK (public.auth_is_board_or_admin(organization_id))', t || '_update', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
         USING (public.auth_is_board_or_admin(organization_id))', t || '_delete', t);
  END LOOP;

  -- ─── hoa_dues (legacy; org_id) ────────────────────────────────────
  CREATE POLICY hoa_dues_select ON public.hoa_dues FOR SELECT TO authenticated
    USING (public.auth_is_board_or_admin(org_id));
  CREATE POLICY hoa_dues_insert ON public.hoa_dues FOR INSERT TO authenticated
    WITH CHECK (public.auth_is_board_or_admin(org_id));
  CREATE POLICY hoa_dues_update ON public.hoa_dues FOR UPDATE TO authenticated
    USING (public.auth_is_board_or_admin(org_id))
    WITH CHECK (public.auth_is_board_or_admin(org_id));
  CREATE POLICY hoa_dues_delete ON public.hoa_dues FOR DELETE TO authenticated
    USING (public.auth_is_board_or_admin(org_id));

  -- ─── assessments: board/admin, or a resident's own units (read) ───
  CREATE POLICY assessments_select ON public.assessments FOR SELECT TO authenticated
    USING (
      public.auth_is_board_or_admin(organization_id)
      OR (
        organization_id = ANY (public.auth_org_ids())
        AND unit_id = ANY ((SELECT public.auth_resident_unit_ids())::uuid[])
      )
    );
  CREATE POLICY assessments_insert ON public.assessments FOR INSERT TO authenticated
    WITH CHECK (public.auth_is_board_or_admin(organization_id));
  CREATE POLICY assessments_update ON public.assessments FOR UPDATE TO authenticated
    USING (public.auth_is_board_or_admin(organization_id))
    WITH CHECK (public.auth_is_board_or_admin(organization_id));
  CREATE POLICY assessments_delete ON public.assessments FOR DELETE TO authenticated
    USING (public.auth_is_board_or_admin(organization_id));

  -- ─── payments: board/admin, or payments on a resident's own units ─
  CREATE POLICY payments_select ON public.payments FOR SELECT TO authenticated
    USING (
      public.auth_is_board_or_admin(organization_id)
      OR (
        organization_id = ANY (public.auth_org_ids())
        AND (
          unit_id = ANY ((SELECT public.auth_resident_unit_ids())::uuid[])
          OR EXISTS (
            SELECT 1 FROM public.assessments a
             WHERE a.id = payments.assessment_id
               AND a.unit_id = ANY ((SELECT public.auth_resident_unit_ids())::uuid[])
          )
        )
      )
    );
  CREATE POLICY payments_insert ON public.payments FOR INSERT TO authenticated
    WITH CHECK (public.auth_is_board_or_admin(organization_id));
  CREATE POLICY payments_update ON public.payments FOR UPDATE TO authenticated
    USING (public.auth_is_board_or_admin(organization_id))
    WITH CHECK (public.auth_is_board_or_admin(organization_id));
  CREATE POLICY payments_delete ON public.payments FOR DELETE TO authenticated
    USING (public.auth_is_board_or_admin(organization_id));

  -- ─── child tables: scope through the parent's org ─────────────────
  CREATE POLICY budget_line_items_all ON public.budget_line_items FOR ALL TO authenticated
    USING (EXISTS (
      SELECT 1 FROM public.budgets b
       WHERE b.id = budget_line_items.budget_id
         AND public.auth_is_board_or_admin(b.organization_id)))
    WITH CHECK (EXISTS (
      SELECT 1 FROM public.budgets b
       WHERE b.id = budget_line_items.budget_id
         AND public.auth_is_board_or_admin(b.organization_id)));

  CREATE POLICY adjusting_entries_all ON public.adjusting_entries FOR ALL TO authenticated
    USING (EXISTS (
      SELECT 1 FROM public.journal_entries je
       WHERE je.id = adjusting_entries.journal_entry_id
         AND public.auth_is_board_or_admin(je.organization_id)))
    WITH CHECK (EXISTS (
      SELECT 1 FROM public.journal_entries je
       WHERE je.id = adjusting_entries.journal_entry_id
         AND public.auth_is_board_or_admin(je.organization_id)));

  CREATE POLICY closing_entries_all ON public.closing_entries FOR ALL TO authenticated
    USING (EXISTS (
      SELECT 1 FROM public.journal_entries je
       WHERE je.id = closing_entries.journal_entry_id
         AND public.auth_is_board_or_admin(je.organization_id)))
    WITH CHECK (EXISTS (
      SELECT 1 FROM public.journal_entries je
       WHERE je.id = closing_entries.journal_entry_id
         AND public.auth_is_board_or_admin(je.organization_id)));

  -- ─── plaid_items: write-once by board/admin, never read by a user ─
  CREATE POLICY plaid_items_insert ON public.plaid_items FOR INSERT TO authenticated
    WITH CHECK (public.auth_is_board_or_admin(organization_id));

  -- ─── double-post guard ────────────────────────────────────────────
  SELECT count(*) INTO dupes FROM (
    SELECT source_id
      FROM public.journal_entries
     WHERE source = 'bank_rec' AND status = 'posted' AND source_id IS NOT NULL
     GROUP BY source_id
    HAVING count(*) > 1
  ) d;

  IF dupes > 0 THEN
    RAISE WARNING '0061: % bank transaction(s) already have more than one posted bank_rec JE; journal_entries_bank_rec_posted_uniq NOT created. Resolve them (see the apply script pre-check) and re-run.', dupes;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_bank_rec_posted_uniq
      ON public.journal_entries (source_id)
      WHERE source = 'bank_rec' AND status = 'posted' AND source_id IS NOT NULL;
  END IF;

  RAISE NOTICE '0061 ok: money tables role-scoped; double-post index %.',
    CASE WHEN dupes > 0 THEN 'SKIPPED (duplicates exist)' ELSE 'present' END;
END
$mig$;
