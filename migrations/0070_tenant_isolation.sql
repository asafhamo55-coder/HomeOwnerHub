-- 0070_tenant_isolation.sql — BL-175b: SQL tenant-isolation hardening
--
-- Apply: docs/specs/2026-10-20-sql-runbook.md, Section M (pre-checks first).
-- Needs 0000, 0004, 0006, 0012, 0017–0019, 0025, 0027, 0029, 0035, 0038,
-- 0055, 0059, 0061, 0063 (all asserted below). Independent of 0064–0069.
--
-- THE HOLE (security audit, BL-175)
--
-- Any signed-in user can create an organisation and become its admin
-- (apps/hoa/src/app/onboarding/actions.ts). RLS checks only a row's OWN
-- organisation, so the admin of a self-made org A may INSERT rows into A that
-- carry a foreign key pointing at org B's rows. Everything that follows a
-- foreign key without re-checking the org then crosses the boundary:
--
--   * auth_resident_unit_ids() / auth_resident_property_ids() (0061, 0063)
--     trust a planted ownerships / property_residents row, so a resident of B
--     who plants "unit_id = a neighbour's unit" into A reads that neighbour's
--     unit, property, assessments, violations and communications (the audit's
--     central finding);
--   * the Inngest send job follows inbox_drafts.mailbox_account_id with the
--     service role, i.e. sends from B's mailbox;
--   * bank_transactions.bank_account_id, recurring_journal_entries.
--     template_je_id and communication_recipients.communication_id are
--     followed by service-role jobs the same way.
--
-- WHAT THIS MIGRATION DOES (every item is idempotent)
--
--   1. Same-org triggers (23503, also for the service role) on the foreign
--      keys above, through ONE generic SECURITY DEFINER trigger function
--      tenant_fk_same_org(fk_column, parent_table, parent_org_column,
--      child_org_column). The 0067–0069 `*_scope` triggers are per-table;
--      this one is table-driven so the ratchet in
--      tests/integration/schema/fk-same-org-ratchet.test.ts can read the
--      coverage out of pg_trigger.tgargs.
--   2. auth_resident_unit_ids() / auth_resident_property_ids() join the
--      linking row back to the SAME org, require a confirmed email and treat
--      an empty or NULL email as no match (audit M6). They also ignore
--      suspended / archived orgs.
--   3. communications_select: the recipient row must be in the
--      communication's own org.
--   4. H5: state_law_updates is platform-wide editorial content; board/admin
--      of ANY org (including a self-made one) could write it (0012:222-257).
--      The user write policies go; only the service role or
--      auth_is_platform_admin() writes. state_statutes, state_statute_chunks
--      and state_statute_changes: every non-SELECT policy is dropped
--      defensively (there should be none). Global communication_templates
--      (organization_id IS NULL) are already write-protected by 0063.
--   5. M5: auth_org_ids / auth_is_admin / auth_is_board_or_admin (and
--      auth_role_in_org, auth_owner_unit_ids) exclude orgs with suspended_at
--      or archived_at set. DELIBERATE EXCEPTIONS so billing and the
--      "your account is suspended" screen keep working: a member still reads
--      THEIR OWN org_members row and the orgs row of an org they belong to,
--      and an admin keeps orgs_update (the 0066 billing-columns guard still
--      refuses every plan / suspension / Stripe column to a user). Nothing
--      else of a suspended org is readable or writable. Stripe webhooks, the
--      reactivation flow and the platform admin run as the service role.
--   6. L1: auth_org_ids() gets SET search_path = public, pg_temp and
--      public.org_members; every definer helper gets an explicit null-uid
--      guard in its BODY (CI's schema replay re-grants ALL ROUTINES to anon,
--      so REVOKE alone is not enough) and EXECUTE is revoked from
--      PUBLIC/anon.
--   7. L5: ai_runs and ai_feedback: board/admin SELECT (and, for ai_runs,
--      board/admin UPDATE, because the approval flows update ai_runs through
--      the user client: violation-drafts.ts, arc-review/record.ts,
--      bill-scan/actions.ts). No FOR ALL, no user INSERT/DELETE (the workflow
--      runner writes with the service role).
--   8. L2: hoa-photos and eviction-docs storage SELECT/INSERT: board/admin of
--      the object's org only. No resident flow touches either bucket
--      (resident uploads go to hoa-documents under <org>/submissions/).
--   9. M7: sa_resident_insert requires storage_path to start with
--      <org>/submissions/ (the only path the app mints for a resident).
--  10. L7: unique index on orgs.stripe_customer_id where not null.
--
-- Not changed (see the report in the PR): FKs on board-only tables that no
-- service-role job follows (accounting, vendors, collections ...) stay on the
-- ratchet's allowlist; the /legal/updates editor becomes platform-admin-only.
--
-- All-or-nothing.

BEGIN;

-- ── 0. prerequisites ───────────────────────────────────────────────────
DO $pre$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'orgs', 'org_members', 'units', 'ownerships', 'tenancies', 'hoa_properties',
    'property_residents', 'communications', 'communication_recipients', 'tickets',
    'mailbox_accounts', 'inbox_threads', 'inbox_drafts', 'bank_accounts',
    'bank_transactions', 'journal_entries', 'recurring_journal_entries',
    'ai_runs', 'ai_feedback', 'submission_attachments', 'state_law_updates',
    'state_statutes', 'state_statute_chunks', 'state_statute_changes'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION '0070: public.% is missing', t;
    END IF;
  END LOOP;
  IF to_regprocedure('public.auth_is_platform_admin()') IS NULL THEN
    RAISE EXCEPTION '0070: auth_is_platform_admin() is missing (0019)';
  END IF;
  IF to_regprocedure('public.storage_object_org_id(text)') IS NULL THEN
    RAISE EXCEPTION '0070: storage_object_org_id(text) is missing (0055)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'orgs' AND column_name = 'suspended_at')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'orgs' AND column_name = 'archived_at') THEN
    RAISE EXCEPTION '0070: orgs.suspended_at / orgs.archived_at are missing (0019, 0025)';
  END IF;
  IF EXISTS (SELECT 1 FROM public.orgs WHERE stripe_customer_id IS NOT NULL
              GROUP BY stripe_customer_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION '0070: two orgs share a stripe_customer_id; run pre-check M-L7 in the runbook and clean it first';
  END IF;
END $pre$;

-- ── 6 (first, everything below uses these). L1 + M5: the auth helpers ──
-- Null-uid guards are in the BODY on purpose: replay re-grants EXECUTE on all
-- routines to anon, a REVOKE here would be undone.

CREATE OR REPLACE FUNCTION public.auth_org_ids()
RETURNS uuid[]
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE(
    ARRAY(
      SELECT m.org_id
        FROM public.org_members m
        JOIN public.orgs o ON o.id = m.org_id
       WHERE auth.uid() IS NOT NULL
         AND m.user_id = auth.uid()
         AND o.suspended_at IS NULL
         AND o.archived_at IS NULL
    ),
    '{}'::uuid[]
  );
$fn$;

CREATE OR REPLACE FUNCTION public.auth_role_in_org(p_org_id uuid)
RETURNS text
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT m.role
    FROM public.org_members m
    JOIN public.orgs o ON o.id = m.org_id
   WHERE auth.uid() IS NOT NULL
     AND m.org_id = p_org_id
     AND m.user_id = auth.uid()
     AND o.suspended_at IS NULL
     AND o.archived_at IS NULL
   LIMIT 1;
$fn$;

CREATE OR REPLACE FUNCTION public.auth_is_admin(p_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM public.org_members m
         JOIN public.orgs o ON o.id = m.org_id
        WHERE m.org_id = p_org_id
          AND m.user_id = auth.uid()
          AND m.role = 'admin'
          AND o.suspended_at IS NULL
          AND o.archived_at IS NULL
     );
$fn$;

CREATE OR REPLACE FUNCTION public.auth_is_board_or_admin(p_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM public.org_members m
         JOIN public.orgs o ON o.id = m.org_id
        WHERE m.org_id = p_org_id
          AND m.user_id = auth.uid()
          AND m.role IN ('admin', 'board')
          AND o.suspended_at IS NULL
          AND o.archived_at IS NULL
     );
$fn$;

CREATE OR REPLACE FUNCTION public.auth_owner_unit_ids()
RETURNS uuid[]
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE(
    ARRAY(
      SELECT ow.unit_id
        FROM public.ownerships ow
        JOIN public.units u ON u.id = ow.unit_id AND u.organization_id = ow.organization_id
        JOIN public.orgs o ON o.id = u.organization_id
       WHERE auth.uid() IS NOT NULL
         AND ow.owner_user_id = auth.uid()
         AND ow.valid_to IS NULL
         AND o.suspended_at IS NULL
         AND o.archived_at IS NULL
    ),
    ARRAY[]::uuid[]
  );
$fn$;

CREATE OR REPLACE FUNCTION public.auth_is_platform_admin()
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM public.platform_admins
        WHERE user_id = auth.uid()
          AND revoked_at IS NULL
     );
$fn$;

-- ── 2. M6: org-scoped, confirmed-email resident helpers ────────────────
-- (audit locations: 0061:86-108 auth_resident_unit_ids, 0063:173-194
-- auth_resident_property_ids.)
-- The linking row (ownerships / property_residents) must be in the SAME org
-- as the unit / property it names, so a row planted into a self-made org
-- grants nothing. The email branch needs auth.users.email_confirmed_at, and
-- an empty or NULL email never matches (lower('') = lower('') used to).

CREATE OR REPLACE FUNCTION public.auth_resident_unit_ids()
RETURNS uuid[]
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE(
    ARRAY(
      SELECT o.unit_id
        FROM public.ownerships o
        JOIN public.units u ON u.id = o.unit_id AND u.organization_id = o.organization_id
        JOIN public.orgs g ON g.id = u.organization_id
       WHERE auth.uid() IS NOT NULL
         AND o.owner_user_id = auth.uid()
         AND o.valid_to IS NULL
         AND g.suspended_at IS NULL
         AND g.archived_at IS NULL
      UNION
      SELECT u.id
        FROM public.property_residents pr
        JOIN public.units u
          ON u.legacy_hoa_property_id = pr.property_id
         AND u.organization_id = pr.organization_id
        JOIN public.orgs g ON g.id = u.organization_id
       WHERE auth.uid() IS NOT NULL
         AND pr.moved_out_at IS NULL
         AND NULLIF(pr.email, '') IS NOT NULL
         AND g.suspended_at IS NULL
         AND g.archived_at IS NULL
         AND lower(pr.email) = (
           SELECT lower(NULLIF(au.email, ''))
             FROM auth.users au
            WHERE au.id = auth.uid()
              AND au.email_confirmed_at IS NOT NULL
         )
    ),
    ARRAY[]::uuid[]
  );
$fn$;

CREATE OR REPLACE FUNCTION public.auth_resident_property_ids()
RETURNS uuid[]
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE(
    ARRAY(
      SELECT pr.property_id
        FROM public.property_residents pr
        JOIN public.hoa_properties hp
          ON hp.id = pr.property_id AND hp.org_id = pr.organization_id
        JOIN public.orgs g ON g.id = hp.org_id
       WHERE auth.uid() IS NOT NULL
         AND pr.moved_out_at IS NULL
         AND NULLIF(pr.email, '') IS NOT NULL
         AND g.suspended_at IS NULL
         AND g.archived_at IS NULL
         AND lower(pr.email) = lower(NULLIF(auth.jwt() ->> 'email', ''))
         AND EXISTS (SELECT 1 FROM auth.users au
                      WHERE au.id = auth.uid() AND au.email_confirmed_at IS NOT NULL)
      UNION
      SELECT u.legacy_hoa_property_id
        FROM public.units u
        JOIN public.hoa_properties hp
          ON hp.id = u.legacy_hoa_property_id AND hp.org_id = u.organization_id
       WHERE auth.uid() IS NOT NULL
         AND u.id = ANY (public.auth_resident_unit_ids())
         AND u.legacy_hoa_property_id IS NOT NULL
    ),
    ARRAY[]::uuid[]
  );
$fn$;

-- Revoke from PUBLIC/anon, grant to the two roles that need them. (CI's
-- replay re-grants anon; the bodies above are the real guard.)
DO $grants$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.auth_org_ids()', 'public.auth_role_in_org(uuid)', 'public.auth_is_admin(uuid)',
    'public.auth_is_board_or_admin(uuid)', 'public.auth_owner_unit_ids()',
    'public.auth_is_platform_admin()', 'public.auth_resident_unit_ids()',
    'public.auth_resident_property_ids()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $grants$;

-- ── 1. same-org foreign keys ───────────────────────────────────────────
-- Audit locations: inbox_drafts.mailbox_account_id / thread_id (0035, 0038),
-- inbox_threads.mailbox_account_id (0029:77), bank_transactions.
-- bank_account_id (0006:253), recurring_journal_entries.template_je_id
-- (0006:417), ownerships.unit_id (0004:91), tenancies.unit_id (0004:114),
-- property_residents.property_id (0017:90), units.legacy_hoa_property_id
-- (0005:24), communication_recipients.communication_id (0018:129),
-- tickets.unit_id (0024:17).
--
-- TG_ARGV: 0 fk column on the child, 1 parent table, 2 parent's org column,
-- 3 child's org column. SECURITY DEFINER so the parent lookup sees the row
-- whatever the caller's RLS says. A parent that does not exist is left to
-- the real foreign key (it raises 23503 itself).
CREATE OR REPLACE FUNCTION public.tenant_fk_same_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_fk         uuid;
  v_child_org  uuid;
  v_parent_org uuid;
BEGIN
  v_fk := (to_jsonb(new) ->> TG_ARGV[0])::uuid;
  IF v_fk IS NULL THEN
    RETURN new;
  END IF;
  v_child_org := (to_jsonb(new) ->> TG_ARGV[3])::uuid;
  EXECUTE format('SELECT %I FROM public.%I WHERE id = $1', TG_ARGV[2], TG_ARGV[1])
     INTO v_parent_org USING v_fk;
  IF v_parent_org IS NOT NULL AND v_parent_org IS DISTINCT FROM v_child_org THEN
    RAISE EXCEPTION '%.%: % is not in this organization', TG_TABLE_NAME, TG_ARGV[0], TG_ARGV[1]
      USING errcode = '23503';
  END IF;
  RETURN new;
END;
$fn$;

REVOKE ALL ON FUNCTION public.tenant_fk_same_org() FROM PUBLIC, anon, authenticated;

DO $triggers$
DECLARE
  r record;
  v_name text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      -- Exactly the single-column org-to-org foreign keys production has (catalog read, 2026-10-27,
      -- docs/specs/2026-10-27-prod-org-fk-list.txt): 121 keys, 0 rows already crossing orgs.
      ('ai_feedback', 'ai_run_id', 'ai_runs', 'organization_id', 'organization_id'),
      ('arc_requests', 'association_id', 'associations', 'organization_id', 'organization_id'),
      ('arc_requests', 'unit_id', 'units', 'organization_id', 'organization_id'),
      ('assessments', 'association_id', 'associations', 'organization_id', 'organization_id'),
      ('assessments', 'fiscal_period_id', 'fiscal_periods', 'organization_id', 'organization_id'),
      ('assessments', 'unit_id', 'units', 'organization_id', 'organization_id'),
      ('bank_accounts', 'association_id', 'associations', 'organization_id', 'organization_id'),
      ('bank_accounts', 'fund_id', 'funds', 'organization_id', 'organization_id'),
      ('bank_reconciliations', 'bank_account_id', 'bank_accounts', 'organization_id', 'organization_id'),
      ('bank_transactions', 'bank_account_id', 'bank_accounts', 'organization_id', 'organization_id'),
      ('bank_transactions', 'matched_journal_entry_id', 'journal_entries', 'organization_id', 'organization_id'),
      ('bid_comparisons', 'rfp_id', 'rfps', 'organization_id', 'organization_id'),
      ('bids', 'rfp_id', 'rfps', 'organization_id', 'organization_id'),
      ('bids', 'vendor_id', 'vendors', 'organization_id', 'organization_id'),
      ('budgets', 'association_id', 'associations', 'organization_id', 'organization_id'),
      ('budgets', 'fiscal_period_id', 'fiscal_periods', 'organization_id', 'organization_id'),
      ('budgets', 'fund_id', 'funds', 'organization_id', 'organization_id'),
      ('chart_of_accounts', 'association_id', 'associations', 'organization_id', 'organization_id'),
      ('chart_of_accounts', 'fund_id', 'funds', 'organization_id', 'organization_id'),
      ('chart_of_accounts', 'parent_account_id', 'chart_of_accounts', 'organization_id', 'organization_id'),
      ('collection_cases', 'association_id', 'associations', 'organization_id', 'organization_id'),
      ('collection_cases', 'unit_id', 'units', 'organization_id', 'organization_id'),
      ('collection_events', 'collection_case_id', 'collection_cases', 'organization_id', 'organization_id'),
      ('collection_events', 'communication_id', 'communications', 'organization_id', 'organization_id'),
      ('communication_recipients', 'communication_id', 'communications', 'organization_id', 'organization_id'),
      ('communication_recipients', 'unit_id', 'units', 'organization_id', 'organization_id'),
      ('communication_replies', 'communication_id', 'communications', 'organization_id', 'organization_id'),
      ('communication_replies', 'recipient_id', 'communication_recipients', 'organization_id', 'organization_id'),
      ('communication_templates', 'association_id', 'associations', 'organization_id', 'organization_id'),
      ('communication_templates', 'source_template_id', 'communication_templates', 'organization_id', 'organization_id'),
      ('communication_threads', 'association_id', 'associations', 'organization_id', 'organization_id'),
      ('communication_threads', 'root_communication_id', 'communications', 'organization_id', 'organization_id'),
      ('communication_threads', 'unit_id', 'units', 'organization_id', 'organization_id'),
      ('communications', 'association_id', 'associations', 'organization_id', 'organization_id'),
      ('communications', 'template_id', 'communication_templates', 'organization_id', 'organization_id'),
      ('communications', 'thread_id', 'communication_threads', 'organization_id', 'organization_id'),
      ('compliance_deadlines_done', 'association_id', 'associations', 'organization_id', 'organization_id'),
      ('compliance_deadlines_done', 'document_id', 'hoa_documents', 'org_id', 'organization_id'),
      ('dues_rates', 'association_id', 'associations', 'organization_id', 'organization_id'),
      ('dues_rates', 'budget_id', 'budgets', 'organization_id', 'organization_id'),
      ('fiscal_periods', 'association_id', 'associations', 'organization_id', 'organization_id'),
      ('funds', 'association_id', 'associations', 'organization_id', 'organization_id'),
      ('governing_document_chunks', 'document_id', 'governing_documents', 'organization_id', 'organization_id'),
      ('governing_documents', 'association_id', 'associations', 'organization_id', 'organization_id'),
      ('hoa_document_versions', 'document_id', 'hoa_documents', 'org_id', 'org_id'),
      ('hoa_documents', 'source_inbox_attachment_id', 'inbox_attachments', 'organization_id', 'org_id'),
      ('hoa_dues', 'property_id', 'hoa_properties', 'org_id', 'org_id'),
      ('hoa_recurring_events', 'association_id', 'associations', 'organization_id', 'organization_id'),
      ('hoa_violations', 'property_id', 'hoa_properties', 'org_id', 'org_id'),
      ('inbox_attachments', 'message_id', 'inbox_messages', 'organization_id', 'organization_id'),
      ('inbox_attachments', 'thread_id', 'inbox_threads', 'organization_id', 'organization_id'),
      ('inbox_draft_attachments', 'draft_id', 'inbox_drafts', 'organization_id', 'organization_id'),
      ('inbox_drafts', 'mailbox_account_id', 'mailbox_accounts', 'organization_id', 'organization_id'),
      ('inbox_drafts', 'source_thread_id', 'inbox_threads', 'organization_id', 'organization_id'),
      ('inbox_drafts', 'thread_id', 'inbox_threads', 'organization_id', 'organization_id'),
      ('inbox_drafts', 'vendor_id', 'vendors', 'organization_id', 'organization_id'),
      ('inbox_messages', 'communication_id', 'communications', 'organization_id', 'organization_id'),
      ('inbox_messages', 'mailbox_account_id', 'mailbox_accounts', 'organization_id', 'organization_id'),
      ('inbox_messages', 'thread_id', 'inbox_threads', 'organization_id', 'organization_id'),
      ('inbox_reply_embeddings', 'message_id', 'inbox_messages', 'organization_id', 'organization_id'),
      ('inbox_sender_aliases', 'resident_id', 'property_residents', 'organization_id', 'organization_id'),
      ('inbox_sender_aliases', 'unit_id', 'units', 'organization_id', 'organization_id'),
      ('inbox_thread_links', 'thread_id', 'inbox_threads', 'organization_id', 'organization_id'),
      ('inbox_threads', 'mailbox_account_id', 'mailbox_accounts', 'organization_id', 'organization_id'),
      ('inbox_threads', 'resident_id', 'property_residents', 'organization_id', 'organization_id'),
      ('inbox_threads', 'unit_id', 'units', 'organization_id', 'organization_id'),
      ('inbox_threads', 'vendor_id', 'vendors', 'organization_id', 'organization_id'),
      ('insurance_policies', 'association_id', 'associations', 'organization_id', 'organization_id'),
      ('insurance_policies', 'document_id', 'hoa_documents', 'org_id', 'organization_id'),
      ('invoices', 'association_id', 'associations', 'organization_id', 'organization_id'),
      ('invoices', 'vendor_id', 'vendors', 'organization_id', 'organization_id'),
      ('journal_entries', 'association_id', 'associations', 'organization_id', 'organization_id'),
      ('journal_entries', 'fiscal_period_id', 'fiscal_periods', 'organization_id', 'organization_id'),
      ('journal_entries', 'reversed_by_id', 'journal_entries', 'organization_id', 'organization_id'),
      ('journal_entries', 'reverses_id', 'journal_entries', 'organization_id', 'organization_id'),
      ('lease_waiting_list', 'association_id', 'associations', 'organization_id', 'organization_id'),
      ('lease_waiting_list', 'property_id', 'hoa_properties', 'org_id', 'organization_id'),
      ('ledger_entries', 'account_id', 'chart_of_accounts', 'organization_id', 'organization_id'),
      ('ledger_entries', 'fund_id', 'funds', 'organization_id', 'organization_id'),
      ('ledger_entries', 'journal_entry_id', 'journal_entries', 'organization_id', 'organization_id'),
      ('meeting_action_items', 'meeting_id', 'hoa_meeting_minutes', 'org_id', 'org_id'),
      ('meeting_action_items', 'ticket_id', 'tickets', 'organization_id', 'org_id'),
      ('owner_join_codes', 'unit_id', 'units', 'organization_id', 'organization_id'),
      ('owner_join_requests', 'code_id', 'owner_join_codes', 'organization_id', 'organization_id'),
      ('owner_join_requests', 'unit_id', 'units', 'organization_id', 'organization_id'),
      ('ownerships', 'unit_id', 'units', 'organization_id', 'organization_id'),
      ('payment_methods', 'unit_id', 'units', 'organization_id', 'organization_id'),
      ('payment_plans', 'unit_id', 'units', 'organization_id', 'organization_id'),
      ('payments', 'assessment_id', 'assessments', 'organization_id', 'organization_id'),
      ('payments', 'invoice_id', 'invoices', 'organization_id', 'organization_id'),
      ('payments', 'journal_entry_id', 'journal_entries', 'organization_id', 'organization_id'),
      ('payments', 'unit_id', 'units', 'organization_id', 'organization_id'),
      ('plaid_items', 'association_id', 'associations', 'organization_id', 'organization_id'),
      ('pm_rent_ledger', 'property_id', 'pm_properties', 'org_id', 'org_id'),
      ('property_events', 'property_id', 'hoa_properties', 'org_id', 'organization_id'),
      ('property_residents', 'property_id', 'hoa_properties', 'org_id', 'organization_id'),
      ('recurring_journal_entries', 'association_id', 'associations', 'organization_id', 'organization_id'),
      ('recurring_journal_entries', 'template_je_id', 'journal_entries', 'organization_id', 'organization_id'),
      ('resident_communication_preferences', 'unit_id', 'units', 'organization_id', 'organization_id'),
      ('resident_violation_reports', 'about_unit_id', 'units', 'organization_id', 'organization_id'),
      ('resident_violation_reports', 'association_id', 'associations', 'organization_id', 'organization_id'),
      ('rfp_invitations', 'rfp_id', 'rfps', 'organization_id', 'organization_id'),
      ('rfp_invitations', 'vendor_id', 'vendors', 'organization_id', 'organization_id'),
      ('rfps', 'association_id', 'associations', 'organization_id', 'organization_id'),
      ('rfps', 'awarded_to_vendor_id', 'vendors', 'organization_id', 'organization_id'),
      ('tenancies', 'unit_id', 'units', 'organization_id', 'organization_id'),
      ('tickets', 'association_id', 'associations', 'organization_id', 'organization_id'),
      ('tickets', 'unit_id', 'units', 'organization_id', 'organization_id'),
      ('units', 'association_id', 'associations', 'organization_id', 'organization_id'),
      ('units', 'legacy_hoa_property_id', 'hoa_properties', 'org_id', 'organization_id'),
      ('units', 'legacy_pm_property_id', 'pm_properties', 'org_id', 'organization_id'),
      ('vendor_compliance', 'association_id', 'associations', 'organization_id', 'organization_id'),
      ('vendor_compliance', 'vendor_id', 'vendors', 'organization_id', 'organization_id'),
      ('vendor_documents', 'vendor_id', 'vendors', 'organization_id', 'organization_id'),
      ('vendor_internal_ratings', 'association_id', 'associations', 'organization_id', 'organization_id'),
      ('vendor_internal_ratings', 'vendor_id', 'vendors', 'organization_id', 'organization_id'),
      ('vendor_onboarding_invitations', 'vendor_id', 'vendors', 'organization_id', 'organization_id'),
      ('violation_hearings', 'violation_id', 'hoa_violations', 'org_id', 'organization_id'),
      ('zelle_inbound_matches', 'bank_transaction_id', 'bank_transactions', 'organization_id', 'organization_id'),
      ('zelle_inbound_matches', 'matched_assessment_id', 'assessments', 'organization_id', 'organization_id'),
      ('zelle_inbound_matches', 'matched_unit_id', 'units', 'organization_id', 'organization_id')
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

-- ── 3. communications_select (0063:308-315) ────────────────────────────
-- The recipient row that makes a communication visible must be in the
-- communication's OWN org. communication_recipients.communication_id is now
-- also trigger-guarded (above); this closes rows that already exist.
DROP POLICY IF EXISTS communications_select ON public.communications;
CREATE POLICY communications_select ON public.communications FOR SELECT TO authenticated
  USING (
    public.auth_is_board_or_admin(organization_id)
    OR (organization_id = ANY (public.auth_org_ids())
        AND EXISTS (
          SELECT 1 FROM public.communication_recipients r
           WHERE r.communication_id = communications.id
             AND r.organization_id = communications.organization_id
             AND (r.user_id = auth.uid()
                  OR r.unit_id = ANY ((SELECT public.auth_resident_unit_ids())::uuid[])
                  OR (r.email IS NOT NULL
                      AND lower(r.email) = lower(coalesce(auth.jwt() ->> 'email', ''))))))
  );

-- Similar child-join review (0063 / 0064): communication_recipients_select
-- and governing_document_chunks_select already compare the child's own org;
-- the *_messages policies resolve the parent and check ITS org against the
-- caller; hoa_violations_select reads units.legacy_hoa_property_id, which the
-- units trigger above now pins to the unit's org. Nothing else needed.

-- ── 4. H5: state_law_updates and the state_statutes family ─────────────
DO $h5$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT tablename, policyname FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('state_law_updates', 'state_statutes', 'state_statute_chunks', 'state_statute_changes')
       AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $h5$;

DROP POLICY IF EXISTS state_law_updates_platform_admin_write ON public.state_law_updates;
CREATE POLICY state_law_updates_platform_admin_write ON public.state_law_updates
  FOR ALL TO authenticated
  USING (public.auth_is_platform_admin())
  WITH CHECK (public.auth_is_platform_admin());

-- ── 5. M5 exceptions: a suspended org's member still sees their own seat
-- and the org row (billing, "suspended" screen); nothing else.
DROP POLICY IF EXISTS org_members_select ON public.org_members;
CREATE POLICY org_members_select ON public.org_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR org_id = ANY (public.auth_org_ids()));

DROP POLICY IF EXISTS orgs_select ON public.orgs;
CREATE POLICY orgs_select ON public.orgs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_members m
                  WHERE m.org_id = orgs.id AND m.user_id = auth.uid()));

DROP POLICY IF EXISTS orgs_update ON public.orgs;
CREATE POLICY orgs_update ON public.orgs FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_members m
                  WHERE m.org_id = orgs.id AND m.user_id = auth.uid() AND m.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.org_members m
                  WHERE m.org_id = orgs.id AND m.user_id = auth.uid() AND m.role = 'admin'));

-- ── 7. L5: ai_runs / ai_feedback ───────────────────────────────────────
DO $l5$
DECLARE
  p record;
BEGIN
  FOR p IN SELECT tablename, policyname FROM pg_policies
            WHERE schemaname = 'public' AND tablename IN ('ai_runs', 'ai_feedback') LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $l5$;

ALTER TABLE public.ai_runs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_runs_select ON public.ai_runs FOR SELECT TO authenticated
  USING (public.auth_is_board_or_admin(organization_id));
CREATE POLICY ai_runs_update ON public.ai_runs FOR UPDATE TO authenticated
  USING (public.auth_is_board_or_admin(organization_id))
  WITH CHECK (public.auth_is_board_or_admin(organization_id));
CREATE POLICY ai_feedback_select ON public.ai_feedback FOR SELECT TO authenticated
  USING (public.auth_is_board_or_admin(organization_id));

-- ── 8. L2: hoa-photos / eviction-docs are board-only ───────────────────
-- (0055:97-109, 125-137.) Drops every SELECT / INSERT / ALL policy that names
-- either bucket (permissive policies OR together), then recreates them.
-- UPDATE / DELETE (0059) stay: board/admin or the uploader.
DO $l2$
DECLARE
  p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
            WHERE schemaname = 'storage' AND tablename = 'objects'
              AND cmd IN ('SELECT', 'INSERT', 'ALL')
              AND (coalesce(qual, '') || coalesce(with_check, '')) ~ '(hoa-photos|eviction-docs)' LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', p.policyname);
  END LOOP;
END $l2$;

CREATE POLICY "board_read_hoa_photos" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'hoa-photos'
  AND public.storage_object_org_id(name) = ANY (public.auth_org_ids())
  AND public.auth_is_board_or_admin(public.storage_object_org_id(name))
);
CREATE POLICY "board_insert_hoa_photos" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'hoa-photos'
  AND public.storage_object_org_id(name) = ANY (public.auth_org_ids())
  AND public.auth_is_board_or_admin(public.storage_object_org_id(name))
);
CREATE POLICY "board_read_eviction_docs" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'eviction-docs'
  AND public.storage_object_org_id(name) = ANY (public.auth_org_ids())
  AND public.auth_is_board_or_admin(public.storage_object_org_id(name))
);
CREATE POLICY "board_insert_eviction_docs" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'eviction-docs'
  AND public.storage_object_org_id(name) = ANY (public.auth_org_ids())
  AND public.auth_is_board_or_admin(public.storage_object_org_id(name))
);

-- ── 9. M7: sa_resident_insert (0027:72-89) ─────────────────────────────
DROP POLICY IF EXISTS sa_resident_insert ON public.submission_attachments;
CREATE POLICY sa_resident_insert ON public.submission_attachments
  FOR INSERT
  WITH CHECK (
    organization_id = ANY (public.auth_org_ids())
    AND uploaded_by = auth.uid()
    AND starts_with(storage_path, organization_id::text || '/submissions/')
    AND (
      (thread_type = 'arc' AND EXISTS (
        SELECT 1 FROM public.arc_requests r
        WHERE r.id = parent_id AND r.submitted_by = auth.uid()))
      OR (thread_type = 'ticket' AND EXISTS (
        SELECT 1 FROM public.tickets t
        WHERE t.id = parent_id AND t.submitted_by = auth.uid()))
      OR (thread_type = 'concern' AND EXISTS (
        SELECT 1 FROM public.resident_violation_reports v
        WHERE v.id = parent_id AND v.reported_by = auth.uid()))
    )
  );

-- ── 10. L7: one org per Stripe customer ────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS orgs_stripe_customer_id_uniq
  ON public.orgs (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- ── post-checks (raise and roll everything back) ───────────────────────
DO $post$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n FROM pg_trigger tg
   WHERE NOT tg.tgisinternal AND tg.tgname LIKE 'zz\_org\_fk\_%' ESCAPE '\'
     AND tg.tgfoid = 'public.tenant_fk_same_org()'::regprocedure;
  IF n < 121 THEN
    RAISE EXCEPTION '0070: expected 121 tenant_fk_same_org triggers, found %', n;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
              AND tablename IN ('ai_runs', 'ai_feedback') AND cmd = 'ALL') THEN
    RAISE EXCEPTION '0070: ai_runs / ai_feedback still have a FOR ALL policy';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p
              WHERE p.proname IN ('auth_org_ids', 'auth_is_admin', 'auth_is_board_or_admin',
                                  'auth_resident_unit_ids', 'auth_resident_property_ids')
                AND p.pronamespace = 'public'::regnamespace
                AND NOT (coalesce(p.proconfig, '{}') @> ARRAY['search_path=public, pg_temp'])) THEN
    RAISE EXCEPTION '0070: an auth helper is missing its pinned search_path';
  END IF;
  RAISE NOTICE '0070 ok: tenant isolation hardening applied.';
END $post$;

COMMIT;
