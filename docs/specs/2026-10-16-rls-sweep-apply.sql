-- Production apply for migration 0063_rls_sweep.
-- Spec: docs/specs/2026-10-16-rls-sweep.md
--
-- Run the parts separately in the Supabase SQL editor, IN ORDER.
-- PART 1a/1b/3 are read-only. PART 2 is the single DO block.
--
-- Ordering vs code: the branch's code changes (board-only gates on
-- violations, meetings, action items, documents, properties, property
-- events, communications send/delete, and the parse-document,
-- daily-digest and governing-docs upload routes) are safe to deploy before
-- OR after this migration. They only refuse callers the new policies
-- refuse anyway, and every legitimate path works under both the old and
-- the new policies. Deploying the code first is the safer order.
--
-- Rollback: PART 1a's output is the rollback reference. Re-create the
-- listed policies verbatim (and DROP the 127 new ones) to restore the
-- previous behaviour. Not expected to be needed; every resident and board
-- path is covered by tests/integration/security/rls-sweep.test.ts.

-- ─── PART 1a: pre-check, current policies (read-only) ─────────────────
-- Expect 46 rows (the count on a clean replay of 0000-0062), mostly `org_access` (ALL, qual = org membership
-- only) plus the resident_own_* / board_or_admin_* pairs on the submission
-- tables, templates_* on communication_templates, org_read / board_or_admin_*
-- on property_residents, org_member_view + auth_can_insert_orgs on orgs.
-- ANY policy listed here is dropped by part 2 (permissive policies OR
-- together, so a leftover would keep the hole open). SAVE THIS OUTPUT
-- (copy as CSV or screenshot) before running part 2.
SELECT tablename, policyname, cmd, roles::text, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN (
     'units', 'hoa_properties', 'hoa_documents', 'hoa_meeting_minutes',
     'hoa_recurring_events', 'governing_documents', 'governing_document_chunks',
     'communication_threads', 'communication_replies', 'lease_waiting_list',
     'property_events', 'hoa_digests', 'meeting_action_items',
     'ownerships', 'tenancies', 'property_residents', 'hoa_violations',
     'communication_recipients', 'communications',
     'associations', 'communication_templates', 'hoa_document_versions',
     'notifications', 'push_subscriptions', 'resident_communication_preferences',
     'audit_log', 'orgs',
     'tickets', 'arc_requests', 'resident_violation_reports',
     'ticket_messages', 'arc_request_messages', 'resident_violation_report_messages')
 ORDER BY tablename, policyname;

-- ─── PART 1b: pre-check, prerequisites + counts (read-only) ───────────
-- Every has_* / *_exists column must be true. swept_tables_present must
-- be 33. current_policy_count is informational (compare with 1a's rows).
SELECT
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relname IN (
        'units', 'hoa_properties', 'hoa_documents', 'hoa_meeting_minutes',
        'hoa_recurring_events', 'governing_documents', 'governing_document_chunks',
        'communication_threads', 'communication_replies', 'lease_waiting_list',
        'property_events', 'hoa_digests', 'meeting_action_items',
        'ownerships', 'tenancies', 'property_residents', 'hoa_violations',
        'communication_recipients', 'communications',
        'associations', 'communication_templates', 'hoa_document_versions',
        'notifications', 'push_subscriptions', 'resident_communication_preferences',
        'audit_log', 'orgs',
        'tickets', 'arc_requests', 'resident_violation_reports',
        'ticket_messages', 'arc_request_messages', 'resident_violation_report_messages'))
                                                                                AS swept_tables_present,
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN (
        'units', 'hoa_properties', 'hoa_documents', 'hoa_meeting_minutes',
        'hoa_recurring_events', 'governing_documents', 'governing_document_chunks',
        'communication_threads', 'communication_replies', 'lease_waiting_list',
        'property_events', 'hoa_digests', 'meeting_action_items',
        'ownerships', 'tenancies', 'property_residents', 'hoa_violations',
        'communication_recipients', 'communications',
        'associations', 'communication_templates', 'hoa_document_versions',
        'notifications', 'push_subscriptions', 'resident_communication_preferences',
        'audit_log', 'orgs',
        'tickets', 'arc_requests', 'resident_violation_reports',
        'ticket_messages', 'arc_request_messages', 'resident_violation_report_messages'))
                                                                                AS current_policy_count,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'auth_org_ids')                AS has_auth_org_ids,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'auth_is_admin')               AS has_auth_is_admin,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'auth_is_board_or_admin')      AS has_auth_is_board_or_admin,
  -- created by 0061; 0063 depends on it, so 0061 must be applied first
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'auth_resident_unit_ids')      AS has_auth_resident_unit_ids,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
           AND table_name = 'units' AND column_name = 'legacy_hoa_property_id') AS units_legacy_link_exists,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
           AND table_name = 'arc_requests' AND column_name = 'board_response_by') AS arc_board_cols_exist,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
           AND table_name = 'resident_violation_reports' AND column_name = 'hoa_violation_id') AS report_cols_exist,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
           AND table_name = 'communication_recipients' AND column_name = 'email') AS recipient_email_exists,
  -- informational: is the 0028 ops view currently open to anon? (0063 closes it)
  to_regclass('public.property_bridge_gaps') IS NOT NULL
    AND has_table_privilege('anon', 'public.property_bridge_gaps', 'SELECT')    AS bridge_gaps_open_to_anon;

-- ─── PART 2: apply ────────────────────────────────────────────────────
-- Paste the ENTIRE contents of migrations/0063_rls_sweep.sql (one DO
-- block, no BEGIN/COMMIT). Expected output:
--   NOTICE: 0063 ok: 33 tables swept, 127 policies on them.
-- It is idempotent: re-running prints the same notice.

-- ─── PART 3: verify (read-only) ───────────────────────────────────────
-- Every column must be true, except policy_count (a number, expect 127)
-- and bridge_gaps_not_anon, which is defence in depth: the view is
-- closed by security_invoker (RLS applies, and anon has no org), so a
-- later blanket GRANT re-opening the table privilege does not re-open the
-- data. Expect true right after part 2.
WITH swept(t) AS (
  VALUES ('units'), ('hoa_properties'), ('hoa_documents'), ('hoa_meeting_minutes'),
         ('hoa_recurring_events'), ('governing_documents'), ('governing_document_chunks'),
         ('communication_threads'), ('communication_replies'), ('lease_waiting_list'),
         ('property_events'), ('hoa_digests'), ('meeting_action_items'),
         ('ownerships'), ('tenancies'), ('property_residents'), ('hoa_violations'),
         ('communication_recipients'), ('communications'),
         ('associations'), ('communication_templates'), ('hoa_document_versions'),
         ('notifications'), ('push_subscriptions'), ('resident_communication_preferences'),
         ('audit_log'), ('orgs'),
         ('tickets'), ('arc_requests'), ('resident_violation_reports'),
         ('ticket_messages'), ('arc_request_messages'), ('resident_violation_report_messages')
), pol AS (
  SELECT p.* FROM pg_policies p JOIN swept s ON s.t = p.tablename WHERE p.schemaname = 'public'
)
SELECT
  -- none of the old names survive
  NOT EXISTS (SELECT 1 FROM pol WHERE policyname IN (
    'org_access', 'org_member_view', 'auth_can_insert_orgs', 'org_read',
    'resident_own_ticket', 'resident_own_arc', 'resident_own_violation',
    'resident_own_messages', 'resident_own_arc_messages', 'resident_own_report_messages',
    'board_or_admin_ticket', 'board_or_admin_arc', 'board_or_admin_violation',
    'templates_select', 'templates_insert', 'templates_update', 'templates_delete'))      AS old_policies_gone,
  -- no FOR ALL policy left on any swept table
  NOT EXISTS (SELECT 1 FROM pol WHERE cmd = 'ALL')                                         AS no_for_all,
  (SELECT bool_and(c.relrowsecurity) FROM pg_class c JOIN swept s ON c.oid = ('public.' || s.t)::regclass) AS rls_enabled_all,
  -- 13 tables x 4 (member-read 7 + board-only 6) + 6 own-read x 4 + associations 4
  -- + templates 4 + doc versions 4 + notifications 2 + push 4 + prefs 4
  -- + audit 2 + orgs 2 + tickets 4 + arc 5 + reports 4 + messages 3 x 4 = 127
  (SELECT count(*) FROM pol) = 127                                                         AS policy_count_127,
  (SELECT count(*) FROM pol)                                                               AS policy_count,
  -- every policy is TO authenticated (none for anon / public)
  (SELECT bool_and(roles = '{authenticated}') FROM pol)                                    AS authenticated_only,
  -- the BL-007 tables: writes need board/admin
  (SELECT bool_and(coalesce(with_check, qual) LIKE '%auth_is_board_or_admin%')
     FROM pol WHERE tablename IN ('ownerships', 'units', 'property_residents', 'tenancies')
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE'))                                           AS ownership_writes_board_only,
  -- associations (Zelle recipient): no member-only write
  (SELECT bool_and(coalesce(with_check, qual) ~ 'auth_is_(board_or_)?admin')
     FROM pol WHERE tablename = 'associations' AND cmd <> 'SELECT')                        AS associations_writes_role_gated,
  -- audit_log is append-only for users
  NOT EXISTS (SELECT 1 FROM pol WHERE tablename = 'audit_log' AND cmd IN ('UPDATE', 'DELETE')) AS audit_append_only,
  -- orgs: no user INSERT or DELETE
  NOT EXISTS (SELECT 1 FROM pol WHERE tablename = 'orgs' AND cmd IN ('INSERT', 'DELETE'))  AS orgs_no_user_insert_delete,
  -- notifications: users only read and mark read
  (SELECT array_agg(cmd ORDER BY cmd) = ARRAY['SELECT', 'UPDATE']::text[]
     FROM pol WHERE tablename = 'notifications')                                           AS notifications_read_update_only,
  -- the ops view no longer bypasses RLS (the real fix) ...
  (SELECT coalesce('security_invoker=true' = ANY (reloptions), false)
     FROM pg_class WHERE oid = 'public.property_bridge_gaps'::regclass)                    AS bridge_gaps_invoker,
  -- ... and is not granted to anon (defence in depth, see header)
  NOT has_table_privilege('anon', 'public.property_bridge_gaps', 'SELECT')                AS bridge_gaps_not_anon;
